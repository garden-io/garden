/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import { sdk } from "@garden-io/sdk"
import { DockerComposeDeploySpec, DockerComposeProjectSpec } from "./schemas"
import { range } from "lodash"
import type { DockerComposeProviderConfig } from "."
import { compose } from "./tools"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import { ExecParams, PluginTool } from "@garden-io/core/src/util/ext-tools"
import { ActionState } from "@garden-io/core/build/src/actions/types"


// Note: This type is not exhaustive. We're only specifying the fields we're actually using, and the full structure
// has more fields (which we can add here if/when we want to use them directly in the plugin).
// See here for more: https://docs.docker.com/compose/compose-file/
export type ComposeProjectConfig = {
  name?: string
  services: {
    [name: string]: {
      build?: any
      image?: string
      networks?: {
        [name: string]: any
      }
      ports?: { // Short/string-form port specs are normalized into the long/object form.
        target: number
        host_ip?: string
        protocol: string
        mode: string
        published: string
      }
    }
  }
}

export function getCommonArgs(spec: DockerComposeDeploySpec) {
  const args: string[] = ["--ansi=never", "--verbose"]

  for (const envFile of spec.envFiles || []) {
    args.push("--env-file", envFile)
  }

  for (const file of spec.files || []) {
    args.push("--file", file)
  }

  for (const profile of spec.profiles || []) {
    args.push("--profile", profile)
  }

  if (spec.projectName) {
    args.push("--project-name", spec.projectName)
  }

  return args
}

export async function runToolWithArgs(tool: PluginTool, params: ExecParams) {
  const startedAt = new Date()
  let output = ""
  let success = true
  let state: ActionState
  try {
    const result = await tool.exec(params)
    output = result.all || result.stdout
    state = "ready"
  } catch (err) {
    state = "failed"
    success = false
  }

  const completedAt = new Date()

  return {
    state,
    success,
    startedAt,
    completedAt,
    output,
  }
}

const createdNetworkNames = new Set<string>()
const ensureNetworkLock = new AsyncLock()

/**
 * This helper is used to prevent race conditions when multiple calls to `docker compose up` try to ensure that the
 * networks referenced in the relevant compose service config exist.
 *
 * `handler` should call the `docker compose` CLI in such a way that ensures that `qualifiedNetworkNames` exist.
 */
export async function withLockOnNetworkCreation<Result>(
  handler: () => Promise<Result>,
  {
    qualifiedNetworkNames,
    serviceName,
    log,
  }: {
    qualifiedNetworkNames: string[]
    serviceName: string
    log: sdk.types.Log
  }): Promise<Result> {
  const missingNetworkNames = qualifiedNetworkNames.filter((n) => !createdNetworkNames.has(n))
  let res: Result
  if (missingNetworkNames.length === 0) {
    res = await handler()
  } else {
    try {
      await ensureNetworkLock.acquire([...missingNetworkNames], async () => {
        log.silly(`${serviceName} acquired lock on ${missingNetworkNames}`)
        res = await handler()
        for (const networkName of missingNetworkNames) {
          log.silly(`${serviceName} registered ${networkName}`)
          createdNetworkNames.add(networkName)
        }
      })
    } catch (err) {
      throw err
    }
  }
  return res!
}

export function getNetworkNamesFromConfig(config: ComposeProjectConfig, serviceName: string) {
  const projectName = config.name
  const networkNames = Object.keys(config.services[serviceName]?.networks || {})
  return networkNames.map((n) => qualifiedNetworkName(projectName, n))
}

export function qualifiedNetworkName(projectName: string | undefined, networkName: string) {
  return projectName ? `${projectName}_${networkName}` : networkName
}

export interface DockerComposeProjectInfo extends DockerComposeProjectSpec {
  cwd: string
}

export function getProjects(ctx: sdk.types.PluginContext<DockerComposeProviderConfig>): DockerComposeProjectInfo[] {
  return ctx.provider.config.projects.map((p) => ({ ...p, cwd: sdk.util.joinPathWithPosix(ctx.projectRoot, p.path) }))
}

export function getProjectInfo(projectName: string | undefined, path: string) {
  return { name: projectName || null, path, cwd: path }
}

// TODO: Memoize this function based on the SHA of the project file
export async function getComposeConfig(
  ctx: sdk.types.PluginContext<DockerComposeProviderConfig>,
  log: sdk.types.Log,
  project: DockerComposeProjectInfo
) {
  let config: any // TODO: add typing for the resolved config

  const path = project.cwd

  try {
    config = await compose(ctx).json({ log, cwd: path, args: ["config", "--format=json"] })
  } catch (error) {
    throw new ConfigurationError({
      message: `Unable to find or process Docker Compose configuration in path '${path}': ${error}`,
      detail: {
        path,
        error,
      },
    })
  }

  return config
}

type ContainerHealthState = "running" | "exited" | "dead"

type ComposePSResult = {
  Name: string
  Image: string
  Command: string
  Project: string
  Service: string
  State: ContainerHealthState
  Health: string
  ExitCode: number
  Publishers: any[] // Add more typing here if we want to utilize this field in the plugin.
}[]

export async function getComposeContainers(
  ctx: sdk.types.PluginContext<DockerComposeProviderConfig>,
  log: sdk.types.Log,
  project: DockerComposeProjectInfo
): Promise<ComposePSResult> {
  const path = project.cwd

  try {
    const running = await compose(ctx).json({ log, cwd: path, args: ["ps", "--format=json"] })
    return running
  } catch (error) {
    log.error(`An error occurred while running \`docker compose ps\` in path '${path}': ${error}`)
    return []
  }
}

/**
 * Extract ingress URLs from compose ports field.
 *
 * The spec will always be normalized to the long format here.
 * See https://docs.docker.com/compose/compose-file/compose-file-v3/#ports
 */
export function getIngresses(portsArray: any[]) {
  let ingresses: sdk.types.ServiceIngress[] = []

  for (const spec of portsArray) {
    if (spec.mode !== "ingress" || !spec.published || spec.protocol !== "tcp") {
      continue
    }

    const hostSplit = spec.published.split(":")

    if (hostSplit.length > 2) {
      // Invalid
      continue
    }

    let hostname = "127.0.0.1"
    let port = spec.published

    if (hostSplit.length === 2) {
      // e.g. 127.0.0.1:8000:8000
      hostname = hostSplit[0]
      port = hostSplit[1]
    }

    if (port.includes("-")) {
      // e.g. 8000-8001:10000-10001 or 127.0.0.1:8000-8001:10000-10001
      const portSplit = port.split("-")
      if (portSplit.length > 2) {
        // Invalid
        continue
      }
      const [from, to] = portSplit.map((p) => parseInt(p, 10))
      if (from > to) {
        // Invalid
        continue
      }
      for (const p of range(from, to)) {
        ingresses.push({
          hostname,
          path: "/",
          port: p,
          protocol: "http",
        })
      }
    } else {
      ingresses.push({
        hostname,
        port,
        path: "/",
        protocol: "http",
      })
    }
  }

  return ingresses
}
