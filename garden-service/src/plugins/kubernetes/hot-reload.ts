/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import * as execa from "execa"
import { waitForServices } from "./status"
import { HotReloadParams } from "../../types/plugin/params"
import { ContainerModule } from "../container"
import { HotReloadResult } from "../../types/plugin/outputs"
import { getAppNamespace } from "./namespace"
import { rsyncSourcePath, rsyncTargetPath } from "./deployment"
import { kubectl } from "./kubectl"
import getPort = require("get-port")
import { RuntimeError } from "../../exceptions"

export const RSYNC_PORT = 873
export const RSYNC_PORT_NAME = "garden-rsync"

export async function hotReload(
  { ctx, log, runtimeContext, module, buildDependencies }: HotReloadParams<ContainerModule>,
): Promise<HotReloadResult> {
  const hotReloadConfig = module.spec.hotReload!
  const services = module.services

  await waitForServices(ctx, log, runtimeContext, services, buildDependencies)

  const namespace = await getAppNamespace(ctx, ctx.provider)

  const procs = await Bluebird.map(services, async (service) => {
    // Forward random free local port to the remote rsync container.
    const rsyncLocalPort = await getPort()

    const targetDeployment = `deployment/${service.name}`
    const portMapping = `${rsyncLocalPort}:${RSYNC_PORT}`

    log.debug(
      `Forwarding local port ${rsyncLocalPort} to service ${service.name} sync container port ${RSYNC_PORT}`,
    )

    // TODO: use the API directly instead of kubectl (need to reverse engineer kubectl a bit to get how that works)
    const proc = kubectl(ctx.provider.config.context, namespace)
      .spawn(["port-forward", targetDeployment, portMapping])

    return { service, proc, rsyncLocalPort }
    // Need to do one port at a time to avoid conflicting local ports
  }, { concurrency: 1 })

  await Bluebird.map(procs, ({ service, proc, rsyncLocalPort }) => {
    return new Promise((resolve, reject) => {
      proc.on("error", (error) => {
        reject(new RuntimeError(`Unexpected error while synchronising to service ${service.name}: ${error.message}`, {
          error,
          serviceName: service.name,
        }))
      })

      proc.stdout.on("data", (line) => {
        // This is the best indication that we have that the connection is up...
        if (line.toString().includes("Forwarding from ")) {
          Bluebird.map(hotReloadConfig.sync, ({ source, target }) => {
            const src = rsyncSourcePath(module.path, source)
            const destination = `rsync://localhost:${rsyncLocalPort}/volume/${rsyncTargetPath(target)}`
            return execa("rsync", ["-vrptgo", src, destination])
          })
            .then(resolve)
            .catch(reject)
            .finally(() => !proc.killed && proc.kill())
        }
      })
    })
  })

  return {}
}
