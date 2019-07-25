/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import * as execa from "execa"
import normalizePath = require("normalize-path")
import { V1Deployment, V1DaemonSet, V1StatefulSet } from "@kubernetes/client-node"
import { ContainerModule, ContainerHotReloadSpec } from "../container/config"
import { RuntimeError, ConfigurationError } from "../../exceptions"
import { resolve as resolvePath, dirname } from "path"
import { deline } from "../../util/string"
import { set } from "lodash"
import { Service } from "../../types/service"
import { LogEntry } from "../../logger/log-entry"
import { getResourceContainer } from "./helm/common"
import { waitForContainerService } from "./container/status"
import { getPortForward } from "./util"
import { RSYNC_PORT } from "./constants"
import { getAppNamespace } from "./namespace"
import { KubernetesPluginContext } from "./config"
import { HotReloadServiceParams, HotReloadServiceResult } from "../../types/plugin/service/hotReloadService"
import { KubernetesResource } from "./types"
import { normalizeLocalRsyncPath } from "../../util/fs"

export const RSYNC_PORT_NAME = "garden-rsync"

export type HotReloadableResource = KubernetesResource<V1Deployment | V1DaemonSet | V1StatefulSet>

export type HotReloadableKind = "Deployment" | "DaemonSet" | "StatefulSet"

export const hotReloadableKinds: HotReloadableKind[] = ["Deployment", "DaemonSet", "StatefulSet"]

interface ConfigureHotReloadParams {
  target: HotReloadableResource,
  hotReloadSpec: ContainerHotReloadSpec,
  hotReloadCommand?: string[],
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
  target, hotReloadSpec, hotReloadCommand, hotReloadArgs, containerName,
}: ConfigureHotReloadParams) {
  const kind = <HotReloadableKind>target.kind

  set(target, ["metadata", "annotations", "garden.io/hot-reload"], "true")

  const containers = target.spec.template.spec.containers || []
  const mainContainer = getResourceContainer(target, containerName)

  const syncVolumeName = `garden-sync`

  // We're copying the target folder, not just its contents
  const syncConfig = hotReloadSpec.sync
  const targets = syncConfig.map(pair => removeTrailingSlashes(pair.target))
  const copyCommand = makeCopyCommand(targets)

  const initContainer = {
    name: "garden-sync-init",
    image: mainContainer.image,
    command: ["/bin/sh", "-c", copyCommand],
    env: mainContainer.env || [],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [{
      name: syncVolumeName,
      mountPath: "/.garden/hot_reload",
    }],
  }

  const syncMounts = targets.map(t => {
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

    if (hotReloadCommand) {
      container.command = hotReloadCommand
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
  await syncToService(<KubernetesPluginContext>ctx, service, hotReloadConfig, "Deployment", service.name, log)

  return {}
}

/**
 * Creates the initial copy command for the sync init container.
 *
 * This handles copying the target paths from the service's container into a volume that is then shared with the
 * rsync sidecar container.
 *
 * Changes to a source path in a given sync spec are then applied to the corresponding target path (from the same
 * spec) inside the rsync sidecar container, which propagates the changes into the running service's container
 * (which mounts mounts the volume at the appropriate subpaths).
 *
 * @param syncTargets
 */
export function makeCopyCommand(syncTargets: string[]) {
  const commands = syncTargets.map((target) => {
    // Note that we're using `normalizePath` as opposed to `path.normalize` since the latter will produce
    // Win32 style paths on Windows, whereas the command produced runs inside a container that expects
    // POSIX style paths.
    const syncCopySource = normalizePath(`${target}/`, false)
    const syncVolumeTarget = normalizePath(`/.garden/hot_reload/${target}/`, false)
    return `mkdir -p ${dirname(syncVolumeTarget)} && cp -r ${syncCopySource} ${syncVolumeTarget}`
  })
  return commands.join(" && ")
}

export function removeTrailingSlashes(path: string) {
  return path.replace(/\/*$/, "")
}

export function rsyncSourcePath(modulePath: string, sourcePath: string) {
  const path = resolvePath(modulePath, sourcePath)

  return normalizeLocalRsyncPath(path)
    .replace(/\/*$/, "/") // ensure (exactly one) trailing slash
}

/**
 * Removes leading slash, and ensures there's exactly one trailing slash.
 *
 * Converts /src/foo into src/foo/
 * @param target
 */
function rsyncTargetPath(path: string) {
  return path.replace(/^\/*/, "")
    .replace(/\/*$/, "/")
}

/**
 * Ensure a tunnel is set up for connecting to the target service's sync container, and perform a sync.
 *
 * Before performing a sync, we set up a port-forward from a randomly allocated local port to the rsync sidecar
 * container attached to the target service's container.
 *
 * Since hot-reloading is a time-sensitive operation for the end-user, and because setting up this port-forward
 * can take several tens of milliseconds, we maintain a simple in-process cache of previously allocated ports.
 * Therefore, subsequent hot reloads after the initial one (during the execution
 * of the enclosing Garden command) finish more quickly.
 */
export async function syncToService(
  ctx: KubernetesPluginContext,
  service: Service,
  hotReloadSpec: ContainerHotReloadSpec,
  targetKind: HotReloadableKind,
  targetName: string,
  log: LogEntry,
) {
  const targetDeployment = `${targetKind.toLowerCase()}/${targetName}`
  const namespace = await getAppNamespace(ctx, log, ctx.provider)

  try {
    const portForward = await getPortForward({ ctx, log, namespace, targetDeployment, port: RSYNC_PORT })

    return Bluebird.map(hotReloadSpec.sync, ({ source, target }) => {
      const src = rsyncSourcePath(service.sourceModule.path, source)
      const destination = `rsync://localhost:${portForward.localPort}/volume/${rsyncTargetPath(target)}`

      log.debug(`Hot-reloading from ${src} to ${destination}`)

      return execa("rsync", ["-vrpztgo", src, destination])
    })
  } catch (error) {
    throw new RuntimeError(`Unexpected error while synchronising to service ${service.name}: ${error.message}`, {
      error,
      serviceName: service.name,
    })
  }
}
