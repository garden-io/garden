/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { ChildProcess } from "child_process"
import * as execa from "execa"
import { V1Deployment, V1DaemonSet, V1StatefulSet, V1ObjectMeta } from "@kubernetes/client-node"
import { HotReloadServiceParams } from "../../types/plugin/params"
import { ContainerModule, ContainerHotReloadSpec } from "../container/config"
import { HotReloadServiceResult } from "../../types/plugin/outputs"
import { getAppNamespace } from "./namespace"
import { kubectl } from "./kubectl"
import getPort = require("get-port")
import { RuntimeError, ConfigurationError } from "../../exceptions"
import { resolve as resolvePath, normalize } from "path"
import { Omit, registerCleanupFunction } from "../../util/util"
import { deline } from "../../util/string"
import { set } from "lodash"
import { Service } from "../../types/service"
import { PluginContext } from "../../plugin-context"
import { LogEntry } from "../../logger/log-entry"
import { getResourceContainer } from "./helm/common"
import { waitForContainerService } from "./container/status"
import { FileCopySpec } from "../../types/module"

export const RSYNC_PORT = 873
export const RSYNC_PORT_NAME = "garden-rsync"

export type HotReloadableResource = Omit<V1Deployment | V1DaemonSet | V1StatefulSet, "status" | "metadata">
  & { metadata: Partial<V1ObjectMeta> }

export type HotReloadableKind = "Deployment" | "DaemonSet" | "StatefulSet"

export const hotReloadableKinds: HotReloadableKind[] = ["Deployment", "DaemonSet", "StatefulSet"]

interface ConfigureHotReloadParams {
  target: HotReloadableResource,
  hotReloadSpec: ContainerHotReloadSpec,
  hotReloadArgs?: string[],
  containerName?: string,
}

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for hot-reloading.
 *
 * Adds an rsync sidecar container, an emptyDir volume to mount over module dir in app container,
 * and an initContainer to perform the initial population of the emptyDir volume.
 */
export function configureHotReload({
  target, hotReloadSpec, hotReloadArgs, containerName,
}: ConfigureHotReloadParams) {
  const kind = <HotReloadableKind>target.kind

  set(target, ["metadata", "annotations", "garden.io/hot-reload"], "true")

  const containers = target.spec.template.spec.containers || []
  const mainContainer = getResourceContainer(target, containerName)

  const syncVolumeName = `garden-sync`

  // We're copying the target folder, not just its contents
  const syncConfig = hotReloadSpec.sync
  const syncTarget = syncConfig.map(pair => removeTrailingSlashes(pair.target))

  const copyCommands = makeCopyCommands(syncConfig)

  const initContainer = {
    name: "garden-sync-init",
    image: mainContainer.image,
    command: ["/bin/sh", "-c", copyCommands],
    env: mainContainer.env || [],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [{
      name: syncVolumeName,
      mountPath: "/.garden/hot_reload",
    }],
  }

  const syncMounts = syncTarget.map(t => {
    return {
      name: syncVolumeName,
      mountPath: t,
      subPath: rsyncTargetPath(t),
    }
  })

  for (const container of containers) {
    if (!container.volumeMounts) {
      container.volumeMounts = []
    }
    // This any cast (and a couple below) are necessary because of flaws in the TS definitions in the client library.
    container.volumeMounts.push(...<any>syncMounts)

    if (!container.ports) {
      container.ports = []
    }

    if (container.ports.find(p => p.containerPort === RSYNC_PORT)) {
      throw new Error(deline`
        ${kind} ${target.metadata.name} is configured for hot reload, but one of its containers uses
        port ${RSYNC_PORT}, which is reserved for internal use while hot reload is active. Please remove
        ${RSYNC_PORT} from your services' port config.`)
    }

    if (hotReloadArgs) {
      container.args = hotReloadArgs
    }
  }

  const rsyncContainer = {
    name: "garden-rsync",
    image: "eugenmayer/rsync",
    imagePullPolicy: "IfNotPresent",
    env: [
      // This makes sure the server is accessible on any IP address, because CIDRs can be different across clusters.
      // K8s can be trusted to secure the port. - JE
      { name: "ALLOW", value: "0.0.0.0/0" },
    ],
    volumeMounts: [{
      name: syncVolumeName,
      /**
       * We mount at /data because the rsync image we're currently using is configured
       * to use that path.
       */
      mountPath: "/data",
    }],
    ports: [{
      name: RSYNC_PORT_NAME,
      protocol: "TCP",
      containerPort: RSYNC_PORT,
    }],
  }

  // These any casts are necessary because of flaws in the TS definitions in the client library.
  if (!target.spec.template.spec.volumes) {
    target.spec.template.spec.volumes = []
  }

  target.spec.template.spec.volumes.push(<any>{
    name: syncVolumeName,
    emptyDir: {},
  })

  if (!target.spec.template.spec.initContainers) {
    target.spec.template.spec.initContainers = []
  }
  target.spec.template.spec.initContainers.push(<any>initContainer)

  target.spec.template.spec.containers.push(<any>rsyncContainer)
}

/**
 * The hot reload action handler for containers.
 */
export async function hotReloadContainer(
  { ctx, log, runtimeContext, service, module }: HotReloadServiceParams<ContainerModule>,
): Promise<HotReloadServiceResult> {
  const hotReloadConfig = module.spec.hotReload

  if (!hotReloadConfig) {
    throw new ConfigurationError(
      `Module ${module.name} must specify the \`hotReload\` key for service ${service.name} to be hot-reloadable.`,
      { moduleName: module.name, serviceName: service.name },
    )
  }

  await waitForContainerService(ctx, log, runtimeContext, service, true)
  await syncToService(ctx, service, hotReloadConfig, "Deployment", service.name, log)

  return {}
}

/**
 * Creates the initial copy command for the sync init container.
 *
 * This handles copying the contents from source into a volume for
 * the rsync container to update.
 *
 * This needs to deal with nested pathing as well as root.
 * This will first create the path, and then copy the contents from the
 * docker image into the shared volume as a base for the rsync command
 * to update.
 *
 * @param syncConfig
 */
export function makeCopyCommands(syncConfig: FileCopySpec[]) {
  const commands = syncConfig.map(({ source, target }) => {
    const adjustedSource = `${removeTrailingSlashes(source)}/.`
    const absTarget = normalize(`/.garden/hot_reload/${target}/`)
    return `mkdir -p ${absTarget} && cp -r ${adjustedSource} ${absTarget}`
  })
  return commands.join(" && ")
}

/**
 * Ensure that there's no trailing slash
 *
 * converts /src/foo/ into /src/foo
 * @param path
 */
export function removeTrailingSlashes(path: string) {
  return path.replace(/\/*$/, "")
}

export function rsyncSourcePath(modulePath: string, sourcePath: string) {
  return resolvePath(modulePath, sourcePath)
    .replace(/\/*$/, "/") // ensure (exactly one) trailing slash
}

/**
 * Removes leading slash, and ensures there's exactly one trailing slash.
 *
 * converts /src/foo into src/foo/
 * @param target
 */
export function rsyncTargetPath(path: string) {
  return path.replace(/^\/*/, "")
    .replace(/\/*$/, "/")
}

/**
 * Below is the logic that manages syncing into a service's running container.
 *
 * Before performing a sync, we set up a port-forward from a randomly allocated local port to the rsync sidecar
 * container attached to the target service's container.
 *
 * Since hot-reloading is a time-sensitive operation for the end-user, and because setting up this port-forward
 * can take several tens of milliseconds, we maintain a simple in-process cache of previously allocated ports
 * (registeredPortForwards below). Therefore, subsequent hot reloads after the initial one (during the execution
 * of the enclosing Garden command) finish more quickly.
 */

type PortForward = {
  rsyncLocalPort: number,
  proc: ChildProcess,
}

const registeredPortForwards: { [targetDeployment: string]: PortForward } = {}

registerCleanupFunction("kill-hot-reload-port-forward-procs", () => {
  for (const { proc } of Object.values(registeredPortForwards)) {
    !proc.killed && proc.kill()
  }
})

/**
 * Ensure a tunnel is set up for connecting to the target service's sync container, and perform a sync.
 */
export async function syncToService(
  ctx: PluginContext,
  service: Service,
  hotReloadSpec: ContainerHotReloadSpec,
  targetKind: HotReloadableKind,
  targetName: string,
  log: LogEntry,
) {

  let rsyncLocalPort
  const targetDeployment = `${targetKind.toLowerCase()}/${targetName}`

  try {
    rsyncLocalPort = await getLocalRsyncPort(ctx, log, targetDeployment)
  } catch (error) {
    throw new RuntimeError(`Unexpected error while synchronising to service ${service.name}: ${error.message}`, {
      error,
      serviceName: service.name,
    })
  }

  return Bluebird.map(hotReloadSpec.sync, ({ source, target }) => {
    const src = rsyncSourcePath(service.sourceModule.path, source)
    const destination = `rsync://localhost:${rsyncLocalPort}/volume/${rsyncTargetPath(target)}`
    return execa("rsync", ["-vrptgo", src, destination])
  })

}

async function getLocalRsyncPort(ctx: PluginContext, log: LogEntry, targetDeployment: string): Promise<number> {

  let rsyncLocalPort

  const registered = registeredPortForwards[targetDeployment]

  if (registered && !registered.proc.killed) {
    rsyncLocalPort = registered.rsyncLocalPort
    log.debug(`Reusing local port ${rsyncLocalPort} for ${targetDeployment} sync container`)
    return rsyncLocalPort
  }

  const namespace = await getAppNamespace(ctx, ctx.provider)

  // Forward random free local port to the remote rsync container.
  rsyncLocalPort = await getPort()
  const portMapping = `${rsyncLocalPort}:${RSYNC_PORT}`

  log.debug(`Forwarding local port ${rsyncLocalPort} to ${targetDeployment} sync container port ${RSYNC_PORT}`)

  // TODO: use the API directly instead of kubectl (need to reverse engineer kubectl a bit to get how that works)
  const proc = kubectl(ctx.provider.config.context, namespace)
    .spawn(["port-forward", targetDeployment, portMapping])

  return new Promise((resolve) => {
    proc.on("error", (error) => {
      !proc.killed && proc.kill()
      throw error
    })

    proc.stdout.on("data", (line) => {
      // This is unfortunately the best indication that we have that the connection is up...
      if (line.toString().includes("Forwarding from ")) {
        const portForward = { proc, rsyncLocalPort }
        registeredPortForwards[targetDeployment] = portForward
        resolve(rsyncLocalPort)
      }
    })
  })
}
