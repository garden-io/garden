/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
import { cloneDeep, keyBy, omit, set } from "lodash"
import {
  getResourceContainer,
  getResourceKey,
  getResourcePodSpec,
  getTargetResource,
  labelSelectorToString,
} from "./util"
import {
  KubernetesResource,
  SupportedRuntimeAction,
  SyncableKind,
  syncableKinds,
  SyncableResource,
  SyncableRuntimeAction,
} from "./types"
import { ActionLogContext, Log } from "../../logger/log-entry"
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
import { mutagenAgentPath, Mutagen, SyncConfig } from "../../mutagen"
import { k8sSyncUtilImageName } from "./constants"
import { templateStringLiteral } from "../../docs/common"
import { resolve } from "path"
import Bluebird from "bluebird"
import { Resolved } from "../../actions/types"
import { isAbsolute } from "path"
import { joinWithPosix } from "../../util/fs"
import { KubernetesModule, KubernetesService } from "./kubernetes-type/module-config"
import { HelmModule, HelmService } from "./helm/module-config"
import { convertServiceResource } from "./kubernetes-type/common"
import { prepareConnectionOpts } from "./kubectl"
import { GetSyncStatusResult, SyncState } from "../../plugin/handlers/Deploy/get-sync-status"

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

const exampleActionRef = templateStringLiteral("action.build.my-container-image.sourcePath")

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
  const kind: SyncableKind = spec.daemon ? "DaemonSet" : "Deployment"
  const target = { kind, name: action.name }
  const sourcePath = action.basePath()
  const syncSpec = spec.sync

  if (!syncSpec || !target) {
    return
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
          },
          command: syncSpec.command,
          args: syncSpec.args,
        },
      ]
    }
  }

  return sync
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
  action: Resolved<SyncableRuntimeAction>
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

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("mode")], "sync")
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

    set(resolved, ["metadata", "annotations", gardenAnnotationKey("mode")], "sync")
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
    if (!podSpec.initContainers.find((c) => c.image === k8sSyncUtilImageName)) {
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

interface SyncParamsBase {
  ctx: KubernetesPluginContext
  log: Log<ActionLogContext>
}

interface StopSyncsParams extends SyncParamsBase {
  action: SyncableRuntimeAction
}

interface StartSyncsParams extends StopSyncsParams {
  defaultTarget: KubernetesTargetResourceSpec | undefined
  action: Resolved<SyncableRuntimeAction>
  basePath: string
  actionDefaults: SyncDefaults
  manifests: KubernetesResource[]
  defaultNamespace: string
  syncs: KubernetesDeployDevModeSyncSpec[]
}

interface GetSyncStatusParams extends StartSyncsParams {
  monitor: boolean
}

interface PrepareSyncParams extends SyncParamsBase {
  action: Resolved<SupportedRuntimeAction>
  resourceSpec: KubernetesTargetResourceSpec
  spec: KubernetesDeployDevModeSyncSpec
  manifests: KubernetesResource[]
}

export function getLocalSyncPath(sourcePath: string, basePath: string) {
  const localPath = isAbsolute(sourcePath) ? sourcePath : resolve(basePath, sourcePath)
  return localPath.replace(/ /g, "\\ ") // Escape spaces in path
}

export async function startSyncs(params: StartSyncsParams) {
  const { ctx, log, basePath, action, defaultNamespace, actionDefaults, defaultTarget, syncs } = params

  if (syncs.length === 0) {
    return
  }

  const mutagen = new Mutagen({ ctx, log })

  const provider = ctx.provider
  const providerDefaults = provider.config.sync?.defaults || {}

  const expectedKeys: string[] = []

  await Bluebird.map(syncs, async (s) => {
    const resourceSpec = s.target || defaultTarget

    if (!resourceSpec) {
      // This will have been caught and warned about elsewhere
      return
    }

    const { key, description, sourceDescription, targetDescription, target, resourceName, containerName } =
      await prepareSync({
        ...params,
        resourceSpec,
        spec: s,
      })

    // Validate the target
    if (!isConfiguredForSyncMode(target)) {
      log.warn(chalk.yellow(`Resource ${resourceName} is not deployed in sync mode, cannot start sync.`))
      return
    }

    if (!containerName) {
      log.warn(chalk.yellow(`Resource ${resourceName} doesn't have any containers, cannot start sync.`))
      return
    }

    const namespace = target.metadata.namespace || defaultNamespace

    const localPath = getLocalSyncPath(s.sourcePath, basePath)
    const remoteDestination = await getKubectlExecDestination({
      ctx,
      log,
      namespace,
      containerName,
      resourceName,
      targetPath: s.containerPath,
    })

    const mode = s.mode || defaultSyncMode

    log.info(`Syncing ${description} (${mode})`)

    await mutagen.ensureSync({
      log,
      key,
      logSection: action.key(),
      sourceDescription,
      targetDescription,
      config: makeSyncConfig({ providerDefaults, actionDefaults, opts: s, localPath, remoteDestination }),
    })

    // Wait for initial sync to complete
    await mutagen.flushSync(key)

    expectedKeys.push(key)
  })

  const allSyncs = await mutagen.getActiveSyncSessions(log)
  const keyPrefix = getSyncKeyPrefix(ctx, action)

  for (const sync of allSyncs.filter((s) => s.name.startsWith(keyPrefix) && !expectedKeys.includes(s.name))) {
    log.info(`Terminating unexpected/outdated sync ${sync.name}`)
    await mutagen.terminateSync(log, sync.name)
  }

  mutagen.stopMonitoring()
}

export async function stopSyncs(params: StopSyncsParams) {
  const { ctx, log, action } = params

  const mutagen = new Mutagen({ ctx, log })

  const allSyncs = await mutagen.getActiveSyncSessions(log)
  const keyPrefix = getSyncKeyPrefix(ctx, action)
  const syncs = allSyncs.filter((sync) => sync.name.startsWith(keyPrefix))

  for (const sync of syncs) {
    log.debug(`Terminating sync ${sync.name}`)
    await mutagen.terminateSync(log, sync.name)
  }
}

export async function getSyncStatus(params: GetSyncStatusParams): Promise<GetSyncStatusResult> {
  const { ctx, log, basePath, action, defaultNamespace, actionDefaults, defaultTarget, syncs, monitor } = params

  const mutagen = new Mutagen({ ctx, log })
  const allSyncs = await mutagen.getActiveSyncSessions(log)
  const syncsByName = keyBy(allSyncs, "name")

  const provider = ctx.provider
  const providerDefaults = provider.config.sync?.defaults || {}

  let allActive = true
  let someActive = false
  let failed = false
  const expectedKeys: string[] = []

  // TODO: dedupe from startSync
  await Bluebird.map(syncs, async (s) => {
    const resourceSpec = s.target || defaultTarget

    if (!resourceSpec) {
      // This will have been caught and warned about elsewhere
      return
    }

    const { key, sourceDescription, targetDescription, target, resourceName, containerName } = await prepareSync({
      ...params,
      resourceSpec,
      spec: s,
    })

    // Validate the target
    if (!isConfiguredForSyncMode(target)) {
      log.debug(chalk.yellow(`Resource ${resourceName} is not deployed in sync mode, cannot start sync.`))
      return
    }

    if (!containerName) {
      log.debug(chalk.yellow(`Resource ${resourceName} doesn't have any containers, cannot start sync.`))
      return
    }

    const namespace = target.metadata.namespace || defaultNamespace

    const localPath = getLocalSyncPath(s.sourcePath, basePath)
    const remoteDestination = await getKubectlExecDestination({
      ctx,
      log,
      namespace,
      containerName,
      resourceName,
      targetPath: s.containerPath,
    })

    const session = syncsByName[key]

    if (session) {
      if (session.status === "disconnected") {
        failed = true
      } else {
        someActive = true
      }
    } else {
      allActive = false
    }

    expectedKeys.push(key)

    if (monitor) {
      mutagen.monitorSync({
        key,
        logSection: action.key(),
        sourceDescription,
        targetDescription,
        config: makeSyncConfig({ providerDefaults, actionDefaults, opts: s, localPath, remoteDestination }),
      })
    }
  })

  if (monitor) {
    // TODO: emit log events instead of using Log instance on Mutagen instance
    await mutagen.startMonitoring()

    ctx.events.on("abort", () => {
      mutagen.stopMonitoring()
      params.ctx.events.emit("done")
    })
  }

  const keyPrefix = getSyncKeyPrefix(ctx, action)

  let extraSyncs = false

  for (const sync of allSyncs.filter((s) => s.name.startsWith(keyPrefix) && !expectedKeys.includes(s.name))) {
    log.debug(`Found unexpected/outdated sync ${sync.name}`)
    extraSyncs = true
  }

  let state: SyncState = "not-active"

  if (failed) {
    state = "failed"
  } else if (extraSyncs || someActive) {
    state = "outdated"
  } else if (allActive) {
    state = "active"
  }

  return {
    state,
  }
}

function getSyncKeyPrefix(ctx: PluginContext, action: SupportedRuntimeAction) {
  return `k8s--${ctx.environmentName}--${ctx.namespace}--${action.name}--`
}

async function prepareSync({ ctx, log, manifests, action, resourceSpec, spec }: PrepareSyncParams) {
  const provider = ctx.provider

  const target = await getTargetResource({
    ctx,
    log,
    provider,
    manifests,
    action,
    query: resourceSpec,
  })

  const resourceName = getResourceKey(target)

  const key = `${getSyncKeyPrefix(ctx, action)}${target.kind}--${target.metadata.name}`

  const localPathDescription = chalk.white(spec.sourcePath)
  const remoteDestinationDescription = `${chalk.white(spec.containerPath)} in ${chalk.white(resourceName)}`

  let sourceDescription: string
  let targetDescription: string

  const mode = spec.mode || defaultSyncMode

  if (isReverseMode(mode)) {
    sourceDescription = remoteDestinationDescription
    targetDescription = localPathDescription
  } else {
    sourceDescription = localPathDescription
    targetDescription = remoteDestinationDescription
  }

  const description = `${sourceDescription} to ${targetDescription}`

  const containerName = spec.target?.containerName || getResourcePodSpec(target)?.containers[0]?.name

  return {
    key,
    description,
    sourceDescription,
    targetDescription,
    target,
    resourceName,
    containerName,
  }
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

export async function getKubectlExecDestination({
  ctx,
  log,
  namespace,
  containerName,
  resourceName,
  targetPath,
}: {
  ctx: KubernetesPluginContext
  log: Log
  namespace: string
  containerName: string
  resourceName: string
  targetPath: string
}) {
  const kubectl = ctx.tools["kubernetes.kubectl"]
  const kubectlPath = await kubectl.getPath(log)

  const connectionOpts = prepareConnectionOpts({
    provider: ctx.provider,
    namespace,
  })

  const command = [
    kubectlPath,
    "exec",
    "-i",
    ...connectionOpts,
    "--container",
    containerName,
    resourceName,
    "--",
    mutagenAgentPath,
    "synchronizer",
  ]

  return `exec:'${command.join(" ")}':${targetPath}`
}

const isReverseMode = (mode: string) => mode === "one-way-reverse" || mode === "one-way-replica-reverse"
