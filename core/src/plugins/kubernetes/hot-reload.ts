/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import normalizePath = require("normalize-path")
import { V1Deployment, V1DaemonSet, V1StatefulSet, V1Container } from "@kubernetes/client-node"
import { ContainerModule, ContainerHotReloadSpec } from "../container/config"
import { RuntimeError, ConfigurationError } from "../../exceptions"
import { resolve as resolvePath, dirname, posix } from "path"
import { deline, gardenAnnotationKey } from "../../util/string"
import { set, sortBy, flatten } from "lodash"
import { Service } from "../../types/service"
import { LogEntry } from "../../logger/log-entry"
import { getResourceContainer } from "./util"
import { execInWorkload } from "./container/exec"
import { getPortForward, killPortForward } from "./port-forward"
import { RSYNC_PORT } from "./constants"
import { getAppNamespace } from "./namespace"
import { KubernetesPluginContext } from "./config"
import { HotReloadServiceParams, HotReloadServiceResult } from "../../types/plugin/service/hotReloadService"
import { KubernetesResource, KubernetesWorkload, KubernetesList } from "./types"
import { normalizeLocalRsyncPath, normalizeRelativePath } from "../../util/fs"
import { createWorkloadManifest } from "./container/deployment"
import { kubectl } from "./kubectl"
import { labelSelectorToString } from "./util"
import { KubeApi } from "./api"
import { syncWithOptions } from "../../util/sync"
import { Module } from "../../types/module"

export type HotReloadableResource = KubernetesResource<V1Deployment | V1DaemonSet | V1StatefulSet>
export type HotReloadableKind = "Deployment" | "DaemonSet" | "StatefulSet"

export const RSYNC_PORT_NAME = "garden-rsync"
export const hotReloadableKinds: HotReloadableKind[] = ["Deployment", "DaemonSet", "StatefulSet"]

interface ConfigureHotReloadParams {
  target: HotReloadableResource
  hotReloadSpec: ContainerHotReloadSpec
  hotReloadCommand?: string[]
  hotReloadArgs?: string[]
  containerName?: string
}

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for hot-reloading.
 *
 * Adds an rsync sidecar container, an emptyDir volume to mount over module dir in app container,
 * and an initContainer to perform the initial population of the emptyDir volume.
 */
export function configureHotReload({
  target,
  hotReloadSpec,
  hotReloadCommand,
  hotReloadArgs,
  containerName,
}: ConfigureHotReloadParams): void {
  const kind = <HotReloadableKind>target.kind
  set(target, ["metadata", "annotations", gardenAnnotationKey("hot-reload")], "true")
  const mainContainer = getResourceContainer(target, containerName)
  const syncVolumeName = `garden-sync`

  // We're copying the target folder, not just its contents
  const syncConfig = hotReloadSpec.sync
  const targets = syncConfig.map((pair) => removeTrailingSlashes(pair.target))
  const copyCommand = makeCopyCommand(targets)

  const initContainer = {
    name: "garden-sync-init",
    image: mainContainer.image,
    command: ["/bin/sh", "-c", copyCommand],
    env: mainContainer.env || [],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [
      {
        name: syncVolumeName,
        mountPath: "/.garden/hot_reload",
      },
    ],
  }

  const syncMounts = targets.map((t) => {
    return {
      name: syncVolumeName,
      mountPath: t,
      // Need to prefix the target with "root" because we need a "tmp" folder next to it while syncing
      subPath: posix.join("root", rsyncTargetPath(t)),
    }
  })

  if (!mainContainer.volumeMounts) {
    mainContainer.volumeMounts = []
  }
  // This any cast (and a couple below) are necessary because of flaws in the TS definitions in the client library.
  mainContainer.volumeMounts.push(...(<any>syncMounts))

  if (!mainContainer.ports) {
    mainContainer.ports = []
  }

  if (mainContainer.ports.find((p) => p.containerPort === RSYNC_PORT)) {
    throw new Error(deline`
      ${kind} ${target.metadata.name} is configured for hot reload, but one of its containers uses
      port ${RSYNC_PORT}, which is reserved for internal use while hot reload is active. Please remove
      ${RSYNC_PORT} from your services' port config.`)
  }

  if (hotReloadCommand) {
    mainContainer.command = hotReloadCommand
  }

  if (hotReloadArgs) {
    mainContainer.args = hotReloadArgs
  }

  const rsyncContainer: V1Container = {
    name: "garden-rsync",
    image: "gardendev/rsync:0.2.0",
    imagePullPolicy: "IfNotPresent",
    env: [
      // This makes sure the server is accessible on any IP address, because CIDRs can be different across clusters.
      // K8s can be trusted to secure the port. - JE
      { name: "ALLOW", value: "0.0.0.0/0" },
    ],
    volumeMounts: [
      {
        name: syncVolumeName,
        /**
         * We mount at /data because the rsync image we're currently using is configured
         * to use that path.
         */
        mountPath: "/data",
      },
    ],
    ports: [
      {
        name: RSYNC_PORT_NAME,
        protocol: "TCP",
        containerPort: RSYNC_PORT,
      },
    ],
    readinessProbe: {
      initialDelaySeconds: 2,
      periodSeconds: 1,
      timeoutSeconds: 3,
      successThreshold: 1,
      failureThreshold: 5,
      tcpSocket: { port: <object>(<unknown>RSYNC_PORT_NAME) },
    },
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
export async function hotReloadContainer({
  ctx,
  log,
  service,
  module,
}: HotReloadServiceParams<ContainerModule>): Promise<HotReloadServiceResult> {
  const hotReloadSpec = module.spec.hotReload

  if (!hotReloadSpec) {
    throw new ConfigurationError(
      `Module ${module.name} must specify the \`hotReload\` key for service ${service.name} to be hot-reloadable.`,
      { moduleName: module.name, serviceName: service.name }
    )
  }

  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, provider)

  // Find the currently deployed workload by labels
  const manifest = await createWorkloadManifest({
    api,
    provider,
    service,
    runtimeContext: { envVars: {}, dependencies: [] },
    namespace,
    enableHotReload: true,
    production: k8sCtx.production,
    log,
    blueGreen: provider.config.deploymentStrategy === "blue-green",
  })
  const selector = labelSelectorToString({
    [gardenAnnotationKey("service")]: service.name,
  })
  // TODO: make and use a KubeApi method for this
  const res: KubernetesList<KubernetesWorkload> = await kubectl(provider).json({
    args: ["get", manifest.kind, "-l", selector],
    log,
    namespace,
  })
  const list = res.items.filter((r) => r.metadata.annotations![gardenAnnotationKey("hot-reload")] === "true")

  if (list.length === 0) {
    throw new RuntimeError(`Unable to find deployed instance of service ${service.name} with hot-reloading enabled`, {
      service,
      listResult: res,
    })
  }

  const workload = sortBy(list, (r) => r.metadata.creationTimestamp)[list.length - 1]

  await syncToService({
    log,
    ctx: k8sCtx,
    service,
    workload,
    hotReloadSpec,
    namespace,
  })

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
    const syncVolumeTarget = normalizePath(`/.garden/hot_reload/root/${target}/`, false)
    const syncVolumeTmp = normalizePath(`/.garden/hot_reload/tmp/${target}/`, false)
    return [
      `mkdir -p ${dirname(syncVolumeTarget)}`,
      `mkdir -p ${syncVolumeTmp}`,
      `cp -r ${syncCopySource} ${syncVolumeTarget}`,
    ]
  })
  return flatten(commands).join(" && ")
}

export function removeTrailingSlashes(path: string) {
  return path.replace(/\/*$/, "")
}

export function rsyncSourcePath(modulePath: string, sourcePath: string) {
  const path = resolvePath(modulePath, sourcePath)

  return normalizeLocalRsyncPath(path).replace(/\/*$/, "/") // ensure (exactly one) trailing slash
}

/**
 * Removes leading slash, and ensures there's exactly one trailing slash.
 *
 * Converts /src/foo into src/foo/
 * @param target
 */
function rsyncTargetPath(path: string) {
  return path.replace(/^\/*/, "").replace(/\/*$/, "/")
}

interface SyncToServiceParams {
  ctx: KubernetesPluginContext
  service: Service
  hotReloadSpec: ContainerHotReloadSpec
  namespace: string
  workload: KubernetesWorkload
  log: LogEntry
}

/**
 * Ensure a tunnel is set up for connecting to the target service's sync container, and perform a sync.
 */
export async function syncToService({ ctx, service, hotReloadSpec, namespace, workload, log }: SyncToServiceParams) {
  const targetResource = `${workload.kind.toLowerCase()}/${workload.metadata.name}`

  const doSync = async () => {
    const portForward = await getPortForward({ ctx, log, namespace, targetResource, port: RSYNC_PORT })

    const syncResult = await Bluebird.map(hotReloadSpec.sync, ({ source, target }) => {
      const sourcePath = rsyncSourcePath(service.sourceModule.path, source)
      const destinationPath = `rsync://localhost:${portForward.localPort}/volume/root/${rsyncTargetPath(target)}`

      log.debug(`Hot-reloading from ${sourcePath} to ${destinationPath}`)

      const tmpDir = `/tmp/${rsyncTargetPath(target)}`.slice(0, -1) // Trim the trailing slash
      const syncOpts = [
        "--verbose",
        "--recursive",
        "--compress",
        // Preserve modification times
        "--times",
        // Preserve owner + group
        "--owner",
        "--group",
        // Copy permissions
        "--perms",
        // Set a temp directory outside of the target directory to avoid potential conflicts
        "--temp-dir",
        tmpDir,
      ]

      const files = filesForSync(service.sourceModule, source)

      return syncWithOptions({
        syncOpts,
        sourcePath,
        destinationPath,
        withDelete: false,
        log,
        files,
      })
    })

    const postSyncCommand = hotReloadSpec.postSyncCommand
    if (postSyncCommand) {
      // Run post-sync callback inside the pod
      const callbackResult = await execInWorkload({
        log,
        namespace,
        workload,
        command: postSyncCommand,
        provider: ctx.provider,
        interactive: false,
      })
      log.debug(`Running postSyncCommand "${postSyncCommand}", output: ${callbackResult.output}`)
    }

    return syncResult
  }

  try {
    try {
      await doSync()
    } catch (error) {
      if (error.message.includes("did not see server greeting") || error.message.includes("Connection reset by peer")) {
        log.debug(`Port-forward to ${targetResource} disconnected. Retrying.`)
        killPortForward(targetResource, RSYNC_PORT)
        await doSync()
      } else {
        throw error
      }
    }
  } catch (error) {
    throw new RuntimeError(`Unexpected error while synchronising to service ${service.name}: ${error.message}`, {
      error,
      serviceName: service.name,
      targetResource,
    })
  }
}

/**
 * Returns the relative paths (from `source`) to each of `module.version.files` that is nested within `source`.
 *
 * So e.g. `source` = `mydir` would transform a tracked path `/path/to/module/mydir/subdir/myfile` to
 * `subdir/myfile` in the output, and if `source` = `.` or `*`, it would be transformed to `mydir/subdir/myfile`.
 */
export function filesForSync(module: Module, source: string): string[] {
  const normalizedSource = source.replace("**/", "").replace("*", "")

  // Normalize to relative POSIX-style paths
  const moduleFiles = module.version.files.map((f) => normalizeRelativePath(module.path, f))

  if (normalizedSource === "" || normalizedSource === ".") {
    return moduleFiles
  } else {
    return moduleFiles
      .filter((path) => path.startsWith(normalizedSource))
      .map((path) => posix.relative(normalizedSource, path))
  }
}
