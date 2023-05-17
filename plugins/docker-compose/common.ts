/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sdk } from "@garden-io/sdk"
import { DockerComposeDeploySpec, DockerComposeProjectSpec } from "./schemas"
import { range } from "lodash"
import type { DockerComposeProviderConfig } from "."
import { compose } from "./tools"
import { ConfigurationError } from "@garden-io/sdk/exceptions"

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

export interface DockerComposeProjectInfo extends DockerComposeProjectSpec {
  cwd: string
}

export function getProjects(ctx: sdk.types.PluginContext<DockerComposeProviderConfig>): DockerComposeProjectInfo[] {
  return ctx.provider.config.projects.map((p) => ({ ...p, cwd: sdk.util.joinPathWithPosix(ctx.projectRoot, p.path) }))
}

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
