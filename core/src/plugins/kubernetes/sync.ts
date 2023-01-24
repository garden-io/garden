/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  ContainerDeployAction,
  containerSyncPathSchema,
  ContainerSyncSpec,
  defaultSyncMode,
  DevModeSyncOptions,
  DevModeSyncSpec,
  syncDefaultDirectoryModeSchema,
  syncDefaultFileModeSchema,
  syncDefaultGroupSchema,
  syncDefaultOwnerSchema,
  syncExcludeSchema,
  syncModeSchema,
  syncTargetPathSchema,
} from "../container/moduleConfig"
import { dedent, gardenAnnotationKey } from "../../util/string"
import { cloneDeep, omit, set } from "lodash"
import {
  getResourceContainer,
  getResourceKey,
  getResourcePodSpec,
  getTargetResource,
  labelSelectorToString,
} from "./util"
import { KubernetesResource, SupportedRuntimeActions, SyncableKind, syncableKinds, SyncableResource } from "./types"
import { Log } from "../../logger/log-entry"
import chalk from "chalk"
import { joi, joiIdentifier } from "../../config/common"
import {
  KubernetesPluginContext,
  KubernetesProvider,
  KubernetesTargetResourceSpec,
  ServiceResourceSpec,
  targetContainerNameSchema,
  targetResourceSpecSchema,
} from "./config"
import { isConfiguredForSyncMode } from "./status/status"
import { PluginContext } from "../../plugin-context"
import { getKubectlExecDestination, mutagenAgentPath, MutagenDaemon, SyncConfig } from "./mutagen"
import { k8sSyncUtilImageName } from "./constants"
import { templateStringLiteral } from "../../docs/common"
import { resolve } from "path"
import Bluebird from "bluebird"
import { Resolved } from "../../actions/types"
import { isAbsolute } from "path"
import { enumerate } from "../../util/enumerate"
import { joinWithPosix } from "../../util/fs"
import { KubernetesModule, KubernetesService } from "./kubernetes-type/module-config"
import { HelmModule, HelmService } from "./helm/module-config"
import { convertServiceResource } from "./kubernetes-type/common"
import { getDeploymentName } from "./container/deployment"

export const builtInExcludes = ["/**/*.git", "**/*.garden"]

export const syncGuideLink = "https://docs.garden.io/guides/code-synchronization-dev-mode"

export interface KubernetesModuleDevModeSpec extends ContainerSyncSpec {
  containerName?: string
}

export const kubernetesModuleSyncSchema = () =>
  containerSyncPathSchema().keys({
    containerName: joiIdentifier().description(
      `Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.`
    ),
  }).description(dedent`
    Specifies which files or directories to sync to which paths inside the running containers of the service when it's in sync mode, and overrides for the container command and/or arguments.

    Note that \`serviceResource\` must also be specified to enable sync.

    Sync is enabled by setting the \`--sync\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${syncGuideLink}) for more information.
  `)

/**
 * Provider-level sync mode settings for the local and remote k8s providers.
 */
export interface SyncDefaults {
  exclude?: string[]
  fileMode?: number
  directoryMode?: number
  owner?: number | string
  group?: number | string
}

export const syncDefaultsSchema = () =>
  joi.object().keys({
    exclude: syncExcludeSchema().description(dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

        Any exclusion patterns defined in individual sync specs will be applied in addition to these patterns.

        \`.git\` directories and \`.garden\` directories are always ignored.
      `),
    fileMode: syncDefaultFileModeSchema(),
    directoryMode: syncDefaultDirectoryModeSchema(),
    owner: syncDefaultOwnerSchema(),
    group: syncDefaultGroupSchema(),
  }).description(dedent`
    Specifies default settings for syncs (e.g. for \`container\`, \`kubernetes\` and \`helm\` services).

    These are overridden/extended by the settings of any individual sync specs.

    Sync is enabled e.g by setting the \`--sync\` flag on the \`garden deploy\` command.

    See the [Code Synchronization guide](${syncGuideLink}) for more information.
  `)

export interface KubernetesDeployDevModeSyncSpec extends DevModeSyncOptions {
  sourcePath: string
  containerPath: string
  target?: KubernetesTargetResourceSpec
  containerName?: string
}

const exampleActionRef = templateStringLiteral("build.my-container-image.sourcePath")

export const kubernetesDeploySyncPathSchema = () =>
  syncDefaultsSchema()
    .keys({
      target: targetResourceSpecSchema().description(
        "The Kubernetes resource to sync to. If specified, this is used instead of `spec.defaultTarget`."
      ),
      sourcePath: joi
        .posixPath()
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

export interface KubernetesDeploySyncSpec {
  defaults?: SyncDefaults
  paths?: KubernetesDeployDevModeSyncSpec[]
  overrides?: KubernetesDeployOverrideSpec[]
}

const syncModeOverrideSpec = () =>
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

export const kubernetesDeploySyncSchema = () =>
  joi
    .object()
    .keys({
      defaults: syncDefaultsSchema().description(
        "Defaults to set across every sync for this Deploy. If you use the `exclude` field here, it will be merged with any excludes set in individual syncs. These are applied on top of any defaults set in the provider configuration."
      ),
      paths: joi
        .array()
        .items(kubernetesDeploySyncPathSchema())
        .description("A list of syncs to start once the Deploy is successfully started."),
      overrides: joi.array().items(syncModeOverrideSpec()),
    })
    .rename("syncs", "paths")
    .description(
      dedent`
      Configure path syncs for the resources in this Deploy.

      If you have multiple syncs for the Deploy, you can use the \`defaults\` field to set common configuration for every individual sync.
      `
    )

export function convertKubernetesModuleDevModeSpec(
  module: KubernetesModule | HelmModule,
  service: KubernetesService | HelmService,
  serviceResource: ServiceResourceSpec | undefined
): KubernetesDeploySyncSpec | undefined {
  const target = convertServiceResource(module, serviceResource)
  const sourcePath = service.sourceModule.path
  const syncSpec = module.spec.sync

  if (!syncSpec || !target) {
    return undefined
  }

  const sync: KubernetesDeploySyncSpec = {
    paths: convertSyncPaths(sourcePath, syncSpec.paths, target),
  }

  if (syncSpec.command || syncSpec.args) {
    if (target.kind && target.name) {
      sync.overrides = [
        {
          target: {
            kind: target.kind,
            name: target.name,
            containerName: target.containerName,
          },
          command: syncSpec.command,
          args: syncSpec.args,
        },
      ]
    }
  }

  return sync
}

export function convertContainerSyncSpec(
  ctx: KubernetesPluginContext,
  action: Resolved<ContainerDeployAction>
): KubernetesDeploySyncSpec | undefined {
  const spec = action.getSpec()

  if (!spec.sync) {
    return
  }

  const kind: SyncableKind = spec.daemon ? "DaemonSet" : "Deployment"
  const blueGreen = ctx.provider.config.deploymentStrategy === "blue-green"
  const deploymentName = getDeploymentName(action.name, blueGreen, action.versionString())
  const target = { kind, name: deploymentName }

  return {
    paths: convertSyncPaths(action.basePath(), spec.sync.paths, target),
  }
}

function convertSyncPaths(
  basePath: string,
  syncSpecs: DevModeSyncSpec[],
  target: KubernetesTargetResourceSpec | undefined
): KubernetesDeployDevModeSyncSpec[] {
  return syncSpecs.map((sync) => ({
    ...omit(sync, ["source"]),
    sourcePath: joinWithPosix(basePath, sync.source),
    containerPath: sync.target,
    target,
  }))
}

export async function configureSyncMode({
  ctx,
  log,
  provider,
  action,
  defaultTarget,
  manifests,
  spec,
}: {
  ctx: PluginContext
  log: Log
  provider: KubernetesProvider
  action: Resolved<SupportedRuntimeActions>
  defaultTarget: KubernetesTargetResourceSpec | undefined
  manifests: KubernetesResource[]
  spec: KubernetesDeploySyncSpec
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

  for (const sync of spec.paths || []) {
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

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("sync-mode")], "true")
    const targetContainer = getResourceContainer(resolved, target.containerName)

    if (override.command) {
      targetContainer.command = override.command
    }
    if (override.args) {
      targetContainer.args = override.args
    }

    updatedTargets[key] = resolved
  }

  for (const sync of spec.paths || []) {
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

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("sync-mode")], "true")
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

interface StartSyncModeParams {
  ctx: KubernetesPluginContext
  log: Log
  action: Resolved<SupportedRuntimeActions>
  defaultNamespace: string
  manifests: KubernetesResource[]
  basePath: string
  actionDefaults: SyncDefaults
  defaultTarget: KubernetesTargetResourceSpec | undefined
  syncs: KubernetesDeployDevModeSyncSpec[]
}

export function getLocalSyncPath(sourcePath: string, basePath: string) {
  const localPath = isAbsolute(sourcePath) ? sourcePath : resolve(basePath, sourcePath)
  return localPath.replace(/ /g, "\\ ") // Escape spaces in path
}

export async function startSyncs({
  ctx,
  log,
  basePath,
  manifests,
  action,
  defaultNamespace,
  actionDefaults,
  defaultTarget,
  syncs,
}: StartSyncModeParams) {
  if (syncs.length === 0) {
    return
  }

  const mutagenDaemon = await MutagenDaemon.start({ ctx, log })
  return mutagenDaemon.configLock.acquire("start-sync", async () => {
    const k8sCtx = <KubernetesPluginContext>ctx
    const k8sProvider = <KubernetesProvider>k8sCtx.provider
    const providerDefaults = k8sProvider.config.sync?.defaults || {}

    for (const [i, s] of enumerate(syncs)) {
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

      const resourceName = getResourceKey(target)

      // Validate the target
      if (!isConfiguredForSyncMode(target)) {
        log.warn(chalk.yellow(`Resource ${resourceName} is not deployed in sync mode, cannot start sync.`))
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

      const localPath = getLocalSyncPath(s.sourcePath, basePath)
      const remoteDestination = await getKubectlExecDestination({
        ctx: k8sCtx,
        log,
        namespace,
        containerName,
        resourceName,
        targetPath: s.containerPath,
      })

      const localPathDescription = chalk.white(s.sourcePath)
      const remoteDestinationDescription = `${chalk.white(s.containerPath)} in ${chalk.white(resourceName)}`

      let sourceDescription: string
      let targetDescription: string

      const mode = s.mode || defaultSyncMode

      if (isReverseMode(mode)) {
        sourceDescription = remoteDestinationDescription
        targetDescription = localPathDescription
      } else {
        sourceDescription = localPathDescription
        targetDescription = remoteDestinationDescription
      }

      const description = `${sourceDescription} to ${targetDescription}`

      log.info({ symbol: "info", section: action.key(), msg: chalk.gray(`Syncing ${description} (${mode})`) })

      await mutagenDaemon.ensureSync({
        key,
        logSection: action.name,
        sourceDescription,
        targetDescription,
        config: makeSyncConfig({ providerDefaults, actionDefaults, opts: s, localPath, remoteDestination }),
      })
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
  providerDefaults: SyncDefaults
  actionDefaults: SyncDefaults
  opts: DevModeSyncOptions
}): SyncConfig {
  const mode = opts.mode || defaultSyncMode
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
