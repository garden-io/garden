/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  containerDevModeSchema,
  ContainerDevModeSpec,
  DevModeSyncSpec,
  syncDefaultDirectoryModeSchema,
  syncDefaultFileModeSchema,
  syncDefaultGroupSchema,
  syncDefaultOwnerSchema,
  syncExcludeSchema,
} from "../container/config"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { set } from "lodash"
import { getResourceContainer, getResourcePodSpec } from "./util"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { LogEntry } from "../../logger/log-entry"
import { joinWithPosix } from "../../util/fs"
import chalk from "chalk"
import { PluginContext } from "../../plugin-context"
import { ConfigurationError } from "../../exceptions"
import {
  ensureMutagenSync,
  getKubectlExecDestination,
  mutagenAgentPath,
  mutagenConfigLock,
  SyncConfig,
} from "./mutagen"
import { joi, joiIdentifier } from "../../config/common"
import { KubernetesPluginContext, KubernetesProvider } from "./config"
import { isConfiguredForDevMode } from "./status/status"

export const syncUtilImageName = "gardendev/k8s-sync:0.1.4"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const devModeGuideLink = "https://docs.garden.io/guides/code-synchronization-dev-mode"

interface ConfigureDevModeParams {
  target: HotReloadableResource
  spec: ContainerDevModeSpec
  containerName?: string
}

export interface KubernetesDevModeSpec extends ContainerDevModeSpec {
  containerName?: string
}

export interface KubernetesDevModeDefaults {
  exclude?: string[]
  fileMode?: number
  directoryMode?: number
  owner?: number | string
  group?: number | string
}

/**
 * Provider-level dev mode settings for the local and remote k8s providers.
 */
export const kubernetesDevModeDefaultsSchema = () =>
  joi.object().keys({
    exclude: syncExcludeSchema().description(dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

        Any exclusion patterns defined in individual dev mode sync specs will be applied in addition to these patterns.

        \`.git\` directories and \`.garden\` directories are always ignored.
      `),
    fileMode: syncDefaultFileModeSchema(),
    directoryMode: syncDefaultDirectoryModeSchema(),
    owner: syncDefaultOwnerSchema(),
    group: syncDefaultGroupSchema(),
  }).description(dedent`
    Specifies default settings for dev mode syncs (e.g. for \`container\`, \`kubernetes\` and \`helm\` services).

    These are overridden/extended by the settings of any individual dev mode sync specs for a given module or service.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)

export const kubernetesDevModeSchema = () =>
  containerDevModeSchema().keys({
    containerName: joiIdentifier().description(
      `Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.`
    ),
  }).description(dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

    Note that \`serviceResource\` must also be specified to enable dev mode.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)

/**
 * Configures the specified Deployment, DaemonSet or StatefulSet for dev mode.
 */
export function configureDevMode({ target, spec, containerName }: ConfigureDevModeParams): void {
  set(target, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "true")
  const mainContainer = getResourceContainer(target, containerName)

  if (spec.command) {
    mainContainer.command = spec.command
  }

  if (spec.args) {
    mainContainer.args = spec.args
  }

  if (!spec.sync.length) {
    return
  }

  const podSpec = getResourcePodSpec(target)

  if (!podSpec) {
    return
  }

  // Inject mutagen agent on init
  const gardenVolumeName = `garden`
  const gardenVolumeMount = {
    name: gardenVolumeName,
    mountPath: "/.garden",
  }

  if (!podSpec.volumes) {
    podSpec.volumes = []
  }

  podSpec.volumes.push({
    name: gardenVolumeName,
    emptyDir: {},
  })

  const initContainer = {
    name: "garden-dev-init",
    image: syncUtilImageName,
    command: ["/bin/sh", "-c", "cp /usr/local/bin/mutagen-agent " + mutagenAgentPath],
    imagePullPolicy: "IfNotPresent",
    volumeMounts: [gardenVolumeMount],
  }

  if (!podSpec.initContainers) {
    podSpec.initContainers = []
  }
  podSpec.initContainers.push(initContainer)

  if (!mainContainer.volumeMounts) {
    mainContainer.volumeMounts = []
  }

  mainContainer.volumeMounts.push(gardenVolumeMount)
}

interface StartDevModeSyncParams extends ConfigureDevModeParams {
  ctx: PluginContext
  log: LogEntry
  moduleRoot: string
  namespace: string
  serviceName: string
}

export async function startDevModeSync({
  containerName,
  ctx,
  log,
  moduleRoot,
  namespace,
  spec,
  target,
  serviceName,
}: StartDevModeSyncParams) {
  if (spec.sync.length === 0) {
    return
  }
  namespace = target.metadata.namespace || namespace
  const resourceName = `${target.kind}/${target.metadata.name}`
  const keyBase = `${target.kind}--${namespace}--${target.metadata.name}`

  return mutagenConfigLock.acquire("start-sync", async () => {
    // Validate the target
    if (!isConfiguredForDevMode(target)) {
      throw new ConfigurationError(`Resource ${resourceName} is not deployed in dev mode`, {
        target,
      })
    }

    if (!containerName) {
      containerName = getResourcePodSpec(target)?.containers[0]?.name
    }

    if (!containerName) {
      throw new ConfigurationError(`Resource ${resourceName} doesn't have any containers`, {
        target,
      })
    }

    const k8sCtx = <KubernetesPluginContext>ctx
    const k8sProvider = <KubernetesProvider>k8sCtx.provider
    const defaults = k8sProvider.config.devMode?.defaults || {}

    let i = 0

    for (const s of spec.sync) {
      const key = `${keyBase}-${i}`

      const localPath = joinWithPosix(moduleRoot, s.source).replace(/ /g, "\\ ") // Escape spaces in path
      const remoteDestination = await getKubectlExecDestination({
        ctx: k8sCtx,
        log,
        namespace,
        containerName,
        resourceName: `${target.kind}/${target.metadata.name}`,
        targetPath: s.target,
      })

      const localPathDescription = chalk.white(s.source)
      const remoteDestinationDescription = `${chalk.white(s.target)} in ${chalk.white(resourceName)}`
      let sourceDescription: string
      let targetDescription: string
      if (isReverseMode(s.mode)) {
        sourceDescription = remoteDestinationDescription
        targetDescription = localPathDescription
      } else {
        sourceDescription = localPathDescription
        targetDescription = remoteDestinationDescription
      }

      const description = `${sourceDescription} to ${targetDescription}`

      log.info({ symbol: "info", section: serviceName, msg: chalk.gray(`Syncing ${description} (${s.mode})`) })

      await ensureMutagenSync({
        ctx,
        // Prefer to log to the main view instead of the handler log context
        log,
        key,
        logSection: serviceName,
        sourceDescription,
        targetDescription,
        config: makeSyncConfig({ defaults, spec: s, localPath, remoteDestination }),
      })

      i++
    }
  })
}

export function makeSyncConfig({
  localPath,
  remoteDestination,
  defaults,
  spec,
}: {
  localPath: string
  remoteDestination: string
  defaults: KubernetesDevModeDefaults | null
  spec: DevModeSyncSpec
}): SyncConfig {
  const s = spec
  const d = defaults || {}
  const reverse = isReverseMode(s.mode)
  return {
    alpha: reverse ? remoteDestination : localPath,
    beta: reverse ? localPath : remoteDestination,
    mode: s.mode,
    ignore: [...builtInExcludes, ...(d["exclude"] || []), ...(s.exclude || [])],
    defaultOwner: s.defaultOwner === undefined ? d["owner"] : s.defaultOwner,
    defaultGroup: s.defaultGroup === undefined ? d["group"] : s.defaultGroup,
    defaultDirectoryMode: s.defaultDirectoryMode === undefined ? d["directoryMode"] : s.defaultDirectoryMode,
    defaultFileMode: s.defaultFileMode === undefined ? d["fileMode"] : s.defaultFileMode,
  }
}

const isReverseMode = (mode: string) => mode === "one-way-reverse" || mode === "one-way-replica-reverse"
