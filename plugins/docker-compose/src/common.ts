/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import AsyncLock from "async-lock"
import { sdk } from "@garden-io/sdk"
import {
  DockerComposeActionSpec,
  DockerComposeBuildSpec,
  DockerComposeDeploySpec,
  DockerComposeProjectSpec,
  DockerComposeRunSpec,
  DockerComposeTestSpec,
  ResolvedComposeRunAction,
  ResolvedComposeTestAction,
  ResolvedDockerRunAction,
  ResolvedDockerTestAction,
} from "./schemas"
import { range } from "lodash"
import type { DockerComposeProviderConfig } from "."
import { compose } from "./tools"
import { ExecParams, PluginTool } from "@garden-io/core/src/util/ext-tools"
import { ActionState } from "@garden-io/core/build/src/actions/types"
import { DeepPrimitiveMap, PrimitiveMap } from "@garden-io/core/build/src/config/common"

type DockerComposeDependencySpec = {
  [name: string]: {
    condition?: "service_started" | "service_healthy" | "service_completed_successfully"
    restart?: boolean
    required?: boolean
  }
}

type DockerComposePortsSpec = {
  // Short/string-form port specs are normalized into the long/object form.
  target: number
  host_ip?: string
  protocol: string
  mode: string
  published: string
}[]

// Note: This type is not exhaustive. We're only specifying the fields we're actually using, and the full structure
// has more fields (which we can add here if/when we want to use them directly in the plugin).
// See here for more: https://docs.docker.com/compose/compose-file/
export type DockerComposeProjectConfig = {
  name: string
  services: {
    [name: string]: {
      build?: any
      image?: string
      networks?: {
        [name: string]: any
      }
      depends_on?: string[] | DockerComposeDependencySpec[]
      ports?: DockerComposePortsSpec
    }
  }
}

export function getComposeActionName(serviceName: string, projectName: string | null | undefined) {
  return projectName ? `${projectName}-${serviceName}-compose` : `${serviceName}-compose`
}

function getComposeBuildImageId(serviceName: string, projectName: string) {
  return projectName ? `${projectName}-${serviceName}` : serviceName
}

export interface ComposeBuildOutputs extends DeepPrimitiveMap {
  "image-id": string
}

export function getComposeBuildOutputs(spec: DockerComposeBuildSpec, projectName: string): ComposeBuildOutputs {
  return {
    "image-id": getComposeBuildImageId(spec.service, projectName),
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

export function getRunOpts(
  action: ResolvedComposeRunAction | ResolvedComposeTestAction | ResolvedDockerRunAction | ResolvedDockerTestAction
) {
  const spec = action.getSpec()
  const opts: string[] = getRunEnvOpts(spec)

  // We only build if the Run/Test action specifies a build (which implies a Dockerfile and a build step, in contrast
  // to Runs/Tests which reference an image by tag that's not the output of a Garden Build action).
  !!action.getBuildAction() && opts.push("--build") // TODO: consider making this configurable?
  spec.entrypoint && opts.push("--entrypoint", spec.entrypoint)
  spec.name && opts.push("--name", spec.name)
  spec.rm && opts.push("--rm")
  spec.servicePorts && opts.push("--service-ports")
  spec.useAliases && opts.push("--use-aliases")
  for (const v of spec.volumes) {
    opts.push("--volume", v)
  }
  for (const qualified of spec.networks.map((n) => qualifiedNetworkName(spec.projectName, n))) {
    opts.push("--network", qualified)
  }
  spec.user && opts.push("--user", spec.user)
  spec.workdir && opts.push("--workdir", spec.workdir)

  return opts
}

export function getRunEnvOpts(spec: DockerComposeRunSpec | DockerComposeTestSpec) {
  return Object.keys(spec.env).flatMap((varName) => ["-e", varName])
}

/**
 * A helper for calling `docker` or `docker compose` with the provided options/params.
 *
 * We make `env` a mandatory param to prevent call sites from forgetting to pass it.
 */
export async function runToolWithArgs(tool: PluginTool, params: ExecParams & { env: PrimitiveMap }) {
  const startedAt = new Date()
  let output = ""
  let success = true
  let state: ActionState
  try {
    const result = await tool.exec(params)
    output = result.all || result.stdout
    // console.log(chalk.blue(output))
    state = "ready"
  } catch (err) {
    state = "failed"
    params.log.error(chalk.red((err as Error).message))
    // console.log(chalk.red(err.message))
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
  }
): Promise<Result> {
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

export function getNetworkNamesFromConfig(config: DockerComposeProjectConfig, serviceName: string) {
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

// This is refreshed in the `augmentGraph` handler (which calls `getComposeConfig` with `cache = false`).
// We use this to avoid shelling out to `docker compose config` too often.
let cachedComposeConfig: DockerComposeProjectConfig | null = null

export async function getComposeConfig({
  ctx,
  log,
  cwd,
  cache,
}: {
  ctx: sdk.types.PluginContext<DockerComposeProviderConfig>
  log: sdk.types.Log
  cwd: string
  cache: boolean
}) {
  if (cache && cachedComposeConfig) {
    return cachedComposeConfig
  }
  let config: DockerComposeProjectConfig

  try {
    config = await compose(ctx).json({ log, cwd, args: ["config", "--format=json"] })
    cachedComposeConfig = config
  } catch (error) {
    throw new sdk.exceptions.ConfigurationError({
      message: `Unable to find or process Docker Compose configuration in path '${cwd}': ${error}`,
      wrappedErrors: [sdk.exceptions.toGardenError(error)],
    })
  }

  return config
}

export async function getProjectName({
  ctx,
  log,
  cwd,
  spec,
}: {
  ctx: sdk.types.PluginContext<DockerComposeProviderConfig>
  log: sdk.types.Log
  cwd: string
  spec: DockerComposeActionSpec
}) {
  return spec.projectName || (await getComposeConfig({ ctx, log, cwd, cache: true })).name
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
export function getIngresses(portsArray: DockerComposePortsSpec) {
  const ingresses: sdk.types.ServiceIngress[] = []

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
        port: parseInt(port, 10),
        path: "/",
        protocol: "http",
      })
    }
  }

  return ingresses
}
