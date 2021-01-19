/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerHotReloadSpec } from "../../container/config"
import { RuntimeError, ConfigurationError } from "../../../exceptions"
import { resolve as resolvePath, dirname, posix } from "path"
import { deline, gardenAnnotationKey } from "../../../util/string"
import { set, flatten } from "lodash"
import { Service } from "../../../types/service"
import { LogEntry } from "../../../logger/log-entry"
import { getResourceContainer, getServiceResourceSpec } from "../util"
import { execInWorkload } from "../container/exec"
import { getPortForward, killPortForward } from "../port-forward"
import { rsyncPort, buildSyncVolumeName, rsyncPortName } from "../constants"
import { KubernetesPluginContext } from "../config"
import { KubernetesWorkload } from "../types"
import { normalizeLocalRsyncPath, normalizeRelativePath } from "../../../util/fs"
import { syncWithOptions } from "../../../util/sync"
import { GardenModule } from "../../../types/module"
import { getBaseModule } from "../helm/common"
import { HelmModule, HelmService } from "../helm/config"
import { KubernetesModule, KubernetesService } from "../kubernetes-module/config"
import { HotReloadableKind, HotReloadableResource } from "./hot-reload"
import Bluebird from "bluebird"
import normalizePath from "normalize-path"

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
        name: buildSyncVolumeName,
        mountPath: "/.garden/hot_reload",
      },
    ],
  }

  const syncMounts = targets.map((t) => {
    return {
      name: buildSyncVolumeName,
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

  if (mainContainer.ports.find((p) => p.containerPort === rsyncPort)) {
    throw new Error(deline`
      ${kind} ${target.metadata.name} is configured for hot reload, but one of its containers uses
      port ${rsyncPort}, which is reserved for internal use while hot reload is active. Please remove
      ${rsyncPort} from your services' port config.`)
  }

  if (hotReloadCommand) {
    mainContainer.command = hotReloadCommand
  }

  if (hotReloadArgs) {
    mainContainer.args = hotReloadArgs
  }

  // These any casts are necessary because of flaws in the TS definitions in the client library.
  if (!target.spec.template.spec!.volumes) {
    target.spec.template.spec!.volumes = []
  }

  target.spec.template.spec!.volumes.push(<any>{
    name: buildSyncVolumeName,
    emptyDir: {},
  })

  if (!target.spec.template.spec!.initContainers) {
    target.spec.template.spec!.initContainers = []
  }
  target.spec.template.spec!.initContainers.push(<any>initContainer)

  target.spec.template.spec!.containers.push({
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
        name: buildSyncVolumeName,
        /**
         * We mount at /data because the rsync image we're currently using is configured
         * to use that path.
         */
        mountPath: "/data",
      },
    ],
    ports: [
      {
        name: rsyncPortName,
        protocol: "TCP",
        containerPort: rsyncPort,
      },
    ],
    readinessProbe: {
      initialDelaySeconds: 2,
      periodSeconds: 1,
      timeoutSeconds: 3,
      successThreshold: 1,
      failureThreshold: 5,
      tcpSocket: { port: <object>(<unknown>rsyncPortName) },
    },
  })
}

export function getHotReloadSpec(service: KubernetesService | HelmService) {
  const module = service.module

  let baseModule: GardenModule | undefined = undefined
  if (module.type === "helm") {
    baseModule = getBaseModule(<HelmModule>module)
  }

  const resourceSpec = getServiceResourceSpec(module, baseModule)

  if (!resourceSpec || !resourceSpec.containerModule) {
    throw new ConfigurationError(
      `Module '${module.name}' must specify \`serviceResource.containerModule\` in order to enable hot-reloading.`,
      { moduleName: module.name, resourceSpec }
    )
  }

  if (service.sourceModule.type !== "container") {
    throw new ConfigurationError(
      deline`
      Module '${resourceSpec.containerModule}', referenced on module '${module.name}' under
      \`serviceResource.containerModule\`, is not a container module.
      Please specify the appropriate container module that contains the sources for the resource.`,
      { moduleName: module.name, sourceModuleType: service.sourceModule.type, resourceSpec }
    )
  }

  // The sourceModule property is assigned in the Kubernetes module validate action
  const hotReloadSpec = service.sourceModule.spec.hotReload

  if (!hotReloadSpec) {
    throw new ConfigurationError(
      deline`
      Module '${resourceSpec.containerModule}', referenced on module '${module.name}' under
      \`serviceResource.containerModule\`, is not configured for hot-reloading.
      Please specify \`hotReload\` on the '${resourceSpec.containerModule}' module in order to enable hot-reloading.`,
      { moduleName: module.name, resourceSpec }
    )
  }

  return hotReloadSpec
}

/**
 * Used to determine which container in the target resource to attach the hot reload sync volume to.
 */
export function getHotReloadContainerName(module: KubernetesModule | HelmModule) {
  let baseModule: GardenModule | undefined = undefined
  if (module.type === "helm") {
    baseModule = getBaseModule(<HelmModule>module)
  }

  const resourceSpec = getServiceResourceSpec(module, baseModule)
  return resourceSpec.containerName || module.name
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
    const portForward = await getPortForward({ ctx, log, namespace, targetResource, port: rsyncPort })

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
        ctx,
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
        killPortForward(targetResource, rsyncPort)
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
export function filesForSync(module: GardenModule, source: string): string[] {
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
