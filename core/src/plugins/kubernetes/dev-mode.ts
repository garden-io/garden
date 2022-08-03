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
  defaultDevModeSyncMode,
  DevModeSyncOptions,
  syncDefaultDirectoryModeSchema,
  syncDefaultFileModeSchema,
  syncDefaultGroupSchema,
  syncDefaultOwnerSchema,
  syncExcludeSchema,
  syncModeSchema,
  syncTargetPathSchema,
} from "../container/moduleConfig"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { cloneDeep, set } from "lodash"
import { getResourceContainer, getResourcePodSpec, getTargetResource, labelSelectorToString } from "./util"
import { KubernetesResource, SupportedRuntimeActions, SyncableKind, syncableKinds, SyncableResource } from "./types"
import { LogEntry } from "../../logger/log-entry"
import chalk from "chalk"
import {
  ensureMutagenSync,
  getKubectlExecDestination,
  mutagenAgentPath,
  mutagenConfigLock,
  SyncConfig,
} from "./mutagen"
import { joi, joiIdentifier } from "../../config/common"
import {
  KubernetesPluginContext,
  KubernetesProvider,
  KubernetesTargetResourceSpec,
  targetContainerNameSchema,
  targetResourceSpecSchema,
} from "./config"
import { isConfiguredForDevMode } from "./status/status"
import { k8sSyncUtilImageName } from "./constants"
import { templateStringLiteral } from "../../docs/common"
import { resolve } from "path"
import Bluebird from "bluebird"
import { PluginContext } from "../../plugin-context"
import { Resolved } from "../../actions/base"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const devModeGuideLink = "https://docs.garden.io/guides/code-synchronization-dev-mode"

export interface KubernetesModuleDevModeSpec extends ContainerDevModeSpec {
  containerName?: string
}

export const kubernetesModuleDevModeSchema = () =>
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
 * Provider-level dev mode settings for the local and remote k8s providers.
 */
export interface DevModeDefaults {
  exclude?: string[]
  fileMode?: number
  directoryMode?: number
  owner?: number | string
  group?: number | string
}

export const devModeDefaultsSchema = () =>
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

    These are overridden/extended by the settings of any individual dev mode sync specs.

    Dev mode is enabled when running the \`garden dev\` command, and by setting the \`--dev\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${devModeGuideLink}) for more information.
  `)

export interface KubernetesDeployDevModeSyncSpec extends DevModeSyncOptions {
  sourcePath: string
  containerPath: string
  target?: KubernetesTargetResourceSpec
  containerName?: string
}

const exampleActionRef = templateStringLiteral("build.my-container-image.sourcePath")

export const kubernetesDeployDevModeSyncSchema = () =>
  devModeDefaultsSchema()
    .keys({
      target: targetResourceSpecSchema().description(
        "The Kubernetes resource to sync to. If specified, this is used instead of `spec.defaultTarget`."
      ),
      sourcePath: joi
        .string()
        .uri()
        .default(".")
        .description(
          dedent`
          The local path to sync from, either absolute or relative to the source directory where the Deploy action is defined.

          This should generally be a templated path to another action's source path (e.g. ${exampleActionRef}), or a relative path. If a path is hard-coded, you must make sure the path exists, and that it is reliably the correct path for every user.
          `
        ),
      containerPath: syncTargetPathSchema(),

      exclude: syncExcludeSchema(),
      mode: syncModeSchema(),
      defaultFileMode: syncDefaultFileModeSchema(),
      defaultDirectoryMode: syncDefaultDirectoryModeSchema(),
      defaultOwner: syncDefaultOwnerSchema(),
      defaultGroup: syncDefaultGroupSchema(),
    })
    .description(
      dedent`
      Define a sync to start after the initial Deploy is complete.
      `
    )

export interface KubernetesDeployOverrideSpec {
  target: {
    kind: SyncableKind
    name: string
    containerName?: string
  }
  command?: string[]
  args?: string[]
}

export interface KubernetesDeployDevModeSpec {
  defaults?: DevModeDefaults
  syncs?: KubernetesDeployDevModeSyncSpec[]
  overrides?: KubernetesDeployOverrideSpec[]
}

const devModeOverrideSpec = () =>
  joi.object().keys({
    target: joi.object().keys({
      kind: joi
        .string()
        .valid(...syncableKinds)
        .required()
        .description("The kind of the Kubernetes resource to modify."),
      name: joi.string().required().description("The name of the resource."),
      containerName: targetContainerNameSchema(),
    }),
    command: joi.array().items(joi.string()).description("Override the command/entrypoint in the matched container."),
    args: joi.array().items(joi.string()).description("Override the args in the matched container."),
  })

export const kubernetesDeployDevModeSchema = () =>
  joi
    .object()
    .keys({
      defaults: devModeDefaultsSchema().description(
        "Defaults to set across every sync for this Deploy. If you use the `exclude` field here, it will be merged with any excludes set in individual syncs. These are applied on top of any defaults set in the provider configuration."
      ),
      syncs: joi
        .array()
        .items(kubernetesDeployDevModeSyncSchema())
        .description("A list of syncs to start once the Deploy is successfully started."),
      overrides: joi.array().items(devModeOverrideSpec()),
    })
    .description(
      dedent`
      Configure dev mode syncs for the resources in this Deploy.

      If you have multiple syncs for the Deploy, you can use the \`defaults\` field to set common configuration for every individual sync.
      `
    )

export async function configureDevMode({
  ctx,
  log,
  provider,
  action,
  defaultTarget,
  manifests,
  spec,
}: {
  ctx: PluginContext
  log: LogEntry
  provider: KubernetesProvider
  action: Resolved<SupportedRuntimeActions>
  defaultTarget: KubernetesTargetResourceSpec | undefined
  manifests: KubernetesResource[]
  spec: KubernetesDeployDevModeSpec
}) {
  // Make sure we don't modify inputs in-place
  manifests = cloneDeep(manifests)

  const overridesByTarget: { [ref: string]: KubernetesDeployOverrideSpec } = {}
  const dedupedTargets: { [ref: string]: KubernetesTargetResourceSpec } = {}

  const targetKey = (t: KubernetesTargetResourceSpec) => {
    if (t.podSelector) {
      return labelSelectorToString(t.podSelector)
    } else {
      return `${t.kind}/${t.name}`
    }
  }

  for (const override of spec.overrides || []) {
    const { target } = override
    if (target.kind && target.name) {
      const key = targetKey(target)
      overridesByTarget[key] = override
      dedupedTargets[key] = target
    }
  }

  for (const sync of spec.syncs || []) {
    const target = sync.target || defaultTarget

    if (!target) {
      log.warn(
        chalk.yellow(
          `Dev mode sync on ${action.longDescription()} doesn't specify a target, and none is set as a default.`
        )
      )
      continue
    }

    if (target.podSelector) {
      // These don't call for modification to manifests
      continue
    }

    const key = targetKey(target)
    dedupedTargets[key] = target
  }

  const resolvedTargets: { [ref: string]: SyncableResource } = {}
  const updatedTargets: { [ref: string]: SyncableResource } = {}

  await Bluebird.map(Object.values(dedupedTargets), async (t) => {
    const resolved = await getTargetResource({
      ctx,
      log,
      provider,
      manifests,
      action,
      query: t,
    })
    resolvedTargets[targetKey(t)] = resolved
  })

  for (const override of spec.overrides || []) {
    const { target } = override
    const key = targetKey(target)
    const resolved = resolvedTargets[key]

    if (!resolved) {
      // Should only happen on invalid input
      continue
    }

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "true")
    const targetContainer = getResourceContainer(resolved, target.containerName)

    if (override.command) {
      targetContainer.command = override.command
    }
    if (override.args) {
      targetContainer.args = override.args
    }

    updatedTargets[key] = resolved
  }

  for (const sync of spec.syncs || []) {
    const target = sync.target || defaultTarget

    if (!target) {
      continue
    }

    const key = targetKey(target)
    const resolved = resolvedTargets[key]

    if (!resolved) {
      // Should only happen on invalid input
      continue
    }

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("dev-mode")], "true")
    const targetContainer = getResourceContainer(resolved, target.containerName)

    const podSpec = getResourcePodSpec(resolved)
    if (!podSpec) {
      continue
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
    if (!podSpec.volumes.find((v) => v.name === gardenVolumeName)) {
      podSpec.volumes.push({
        name: gardenVolumeName,
        emptyDir: {},
      })
    }

    if (!podSpec.initContainers) {
      podSpec.initContainers = []
    }
    if (!podSpec.initContainers.find((c) => c.name === k8sSyncUtilImageName)) {
      const initContainer = {
        name: "garden-dev-init",
        image: k8sSyncUtilImageName,
        command: ["/bin/sh", "-c", "cp /usr/local/bin/mutagen-agent " + mutagenAgentPath],
        imagePullPolicy: "IfNotPresent",
        volumeMounts: [gardenVolumeMount],
      }
      podSpec.initContainers.push(initContainer)
    }

    if (!targetContainer.volumeMounts) {
      targetContainer.volumeMounts = []
    }
    if (!targetContainer.volumeMounts.find((v) => v.name === gardenVolumeName)) {
      targetContainer.volumeMounts.push(gardenVolumeMount)
    }

    updatedTargets[key] = resolved
  }

  return { updated: Object.values(updatedTargets), manifests }
}

interface StartDevModeSyncParams {
  ctx: KubernetesPluginContext
  log: LogEntry
  action: Resolved<SupportedRuntimeActions>

  defaultNamespace: string
  manifests: KubernetesResource[]
  basePath: string
  actionDefaults: DevModeDefaults
  defaultTarget: KubernetesTargetResourceSpec | undefined
  syncs: KubernetesDeployDevModeSyncSpec[]
}

export async function startDevModeSyncs({
  ctx,
  log,
  basePath,
  manifests,
  action,
  defaultNamespace,
  actionDefaults,
  defaultTarget,
  syncs,
}: StartDevModeSyncParams) {
  if (syncs.length === 0) {
    return
  }

  return mutagenConfigLock.acquire("start-sync", async () => {
    const k8sCtx = <KubernetesPluginContext>ctx
    const k8sProvider = <KubernetesProvider>k8sCtx.provider
    const providerDefaults = k8sProvider.config.devMode?.defaults || {}

    let i = 0

    for (const s of syncs) {
      const resourceSpec = s.target || defaultTarget

      if (!resourceSpec) {
        // This will have been caught and warned about elsewhere
        continue
      }

      const target = await getTargetResource({
        ctx: k8sCtx,
        log,
        provider: k8sCtx.provider,
        manifests,
        action,
        query: resourceSpec,
      })

      const resourceName = `${target.kind}/${target.metadata.name}`

      // Validate the target
      if (!isConfiguredForDevMode(target)) {
        log.warn(chalk.yellow(`Resource ${resourceName} is not deployed in dev mode, cannot start sync.`))
        continue
      }

      const containerName = s.target?.containerName || getResourcePodSpec(target)?.containers[0]?.name

      if (!containerName) {
        log.warn(chalk.yellow(`Resource ${resourceName} doesn't have any containers, cannot start sync.`))
        continue
      }

      const namespace = target.metadata.namespace || defaultNamespace
      const keyBase = `${target.kind}--${namespace}--${target.metadata.name}`

      const key = `${keyBase}-${i}`

      const localPath = resolve(basePath, s.sourcePath).replace(/ /g, "\\ ") // Escape spaces in path
      const remoteDestination = await getKubectlExecDestination({
        ctx: k8sCtx,
        log,
        namespace,
        containerName,
        resourceName: `${target.kind}/${target.metadata.name}`,
        targetPath: s.containerPath,
      })

      const localPathDescription = chalk.white(s.sourcePath)
      const remoteDestinationDescription = `${chalk.white(s.target)} in ${chalk.white(resourceName)}`

      let sourceDescription: string
      let targetDescription: string

      const mode = s.mode || defaultDevModeSyncMode

      if (isReverseMode(mode)) {
        sourceDescription = remoteDestinationDescription
        targetDescription = localPathDescription
      } else {
        sourceDescription = localPathDescription
        targetDescription = remoteDestinationDescription
      }

      const description = `${sourceDescription} to ${targetDescription}`

      log.info({ symbol: "info", section: action.key(), msg: chalk.gray(`Syncing ${description} (${mode})`) })

      await ensureMutagenSync({
        ctx,
        // Prefer to log to the main view instead of the handler log context
        log,
        key,
        logSection: action.name,
        sourceDescription,
        targetDescription,
        config: makeSyncConfig({ providerDefaults, actionDefaults, opts: s, localPath, remoteDestination }),
      })

      i++
    }
  })
}

export function makeSyncConfig({
  localPath,
  remoteDestination,
  providerDefaults,
  actionDefaults,
  opts,
}: {
  localPath: string
  remoteDestination: string
  providerDefaults: DevModeDefaults
  actionDefaults: DevModeDefaults
  opts: DevModeSyncOptions
}): SyncConfig {
  const mode = opts.mode || defaultDevModeSyncMode
  const reverse = isReverseMode(mode)

  const ignore = [
    ...builtInExcludes,
    ...(providerDefaults["exclude"] || []),
    ...(actionDefaults["exclude"] || []),
    ...(opts.exclude || []),
  ]

  const defaultOwner = opts.defaultOwner || actionDefaults.owner || providerDefaults.owner
  const defaultGroup = opts.defaultGroup || actionDefaults.group || providerDefaults.group
  const defaultDirectoryMode =
    opts.defaultDirectoryMode || actionDefaults.directoryMode || providerDefaults.directoryMode
  const defaultFileMode = opts.defaultFileMode || actionDefaults.fileMode || providerDefaults.fileMode

  return {
    alpha: reverse ? remoteDestination : localPath,
    beta: reverse ? localPath : remoteDestination,
    mode,
    ignore,
    defaultOwner,
    defaultGroup,
    defaultDirectoryMode,
    defaultFileMode,
  }
}

const isReverseMode = (mode: string) => mode === "one-way-reverse" || mode === "one-way-replica-reverse"
