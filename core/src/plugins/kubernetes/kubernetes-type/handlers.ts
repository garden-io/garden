/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty, omit, partition, uniq } from "lodash-es"
import type { ModuleActionHandlers } from "../../../plugin/plugin.js"
import type { DeployState, ForwardablePort, ServiceStatus } from "../../../types/service.js"
import { gardenAnnotationKey } from "../../../util/annotations.js"
import { KubeApi } from "../api.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../config.js"
import { configureSyncMode, convertKubernetesModuleDevModeSpec } from "../sync.js"
import { apply, deleteObjectsBySelector } from "../kubectl.js"
import { streamK8sLogs } from "../logs.js"
import {
  deleteNamespaces,
  getActionNamespace,
  getActionNamespaceStatus,
  updateNamespaceAecAnnotations,
} from "../namespace.js"
import { getForwardablePorts, killPortForwards } from "../port-forward.js"
import { getK8sIngresses } from "../status/ingress.js"
import type { ResourceStatus } from "../status/status.js"
import {
  getDeployedResource,
  k8sManifestHashAnnotationKey,
  resolveResourceStatus,
  resolveResourceStatuses,
  waitForResources,
} from "../status/status.js"
import type { BaseResource, KubernetesResource, KubernetesServerResource } from "../types.js"
import type { KubernetesDeployActionSpecFileSources, ManifestMetadata, ParsedMetadataManifestData } from "./common.js"
import { convertServiceResource, getManifests, getMetadataManifest, parseMetadataResource } from "./common.js"
import type { KubernetesModule } from "./module-config.js"
import { configureKubernetesModule } from "./module-config.js"
import type { ExecBuildConfig } from "../../exec/build.js"
import type { KubernetesActionConfig, KubernetesDeployAction, KubernetesDeployActionConfig } from "./config.js"
import type { DeployActionHandler } from "../../../plugin/action-types.js"
import type { ActionLog, Log } from "../../../logger/log-entry.js"
import type { ActionMode, Resolved } from "../../../actions/types.js"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status.js"
import type { ResolvedDeployAction } from "../../../actions/deploy.js"
import { isSha256 } from "../../../util/hashing.js"
import { prepareSecrets } from "../secrets.js"
import type { KubernetesPodRunActionConfig } from "./kubernetes-pod.js"

export const kubernetesHandlers: Partial<ModuleActionHandlers<KubernetesModule>> = {
  configure: configureKubernetesModule,

  convert: async (params) => {
    const { module, services, tasks, tests, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
    const actions: (ExecBuildConfig | KubernetesActionConfig)[] = []

    if (dummyBuild) {
      actions.push(dummyBuild)
    }

    const service = services[0] // There is always exactly one service in kubernetes modules
    const serviceResource = module.spec.serviceResource

    const manifests: KubernetesResource[] = module.spec.manifests || []

    const fileSources: KubernetesDeployActionSpecFileSources = {
      manifestTemplates: module.spec.files || [],
      manifestFiles: [],
    }
    const include = [...fileSources.manifestFiles, ...fileSources.manifestTemplates]

    const deployAction: KubernetesDeployActionConfig = {
      kind: "Deploy",
      type: "kubernetes",
      name: service.name,
      ...params.baseFields,

      build: dummyBuild?.name,
      dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),
      include,
      timeout: service.spec.timeout,

      spec: {
        ...omit(module.spec, [
          "name",
          "build",
          "files",
          "dependencies",
          "serviceResource",
          "tasks",
          "tests",
          "sync",
          "devMode",
        ]),
        ...fileSources,
        waitForJobs: true,
        manifests,
        sync: convertKubernetesModuleDevModeSpec(module, service, serviceResource),
      },
    }

    const containerModules = module.build.dependencies.map(convertBuildDependency) || []
    if (serviceResource?.containerModule) {
      const containerModuleSpecDep = convertBuildDependency(serviceResource.containerModule)
      if (!containerModules.find((m) => m.name === containerModuleSpecDep.name)) {
        containerModules.push(containerModuleSpecDep)
      }
    }

    deployAction.dependencies?.push(...containerModules)
    deployAction.spec.defaultTarget = convertServiceResource(module, serviceResource) || undefined
    actions.push(deployAction)

    for (const task of tasks) {
      const resource = convertServiceResource(module, task.spec.resource)

      if (!resource) {
        continue
      }

      const runAction: KubernetesPodRunActionConfig = {
        kind: "Run",
        type: "kubernetes-pod",
        name: task.name,
        description: task.spec.description,
        ...params.baseFields,
        disabled: task.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(task.config.dependencies, dummyBuild),
        timeout: task.spec.timeout,

        // @ts-expect-error this error seems like a compiler bug
        spec: {
          ...omit(task.spec, ["name", "files", "description", "dependencies", "disabled", "timeout"] as const),
          resource,
          ...fileSources,
          manifests,
          namespace: module.spec.namespace,
        },
      }
      actions.push(runAction)
    }

    for (const test of tests) {
      const resource = convertServiceResource(module, test.spec.resource)

      if (!resource) {
        continue
      }

      actions.push({
        kind: "Test",
        type: "kubernetes-pod",
        name: module.name + "-" + test.name,
        ...params.baseFields,
        disabled: test.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(test.config.dependencies, dummyBuild),
        timeout: test.spec.timeout,

        spec: {
          ...omit(test.spec, ["name", "dependencies", "disabled", "timeout"]),
          resource,
          ...fileSources,
          manifests,
          namespace: module.spec.namespace,
        },
      })
    }

    return {
      group: {
        kind: "Group",
        name: module.name,
        path: module.path,
        actions,
        variables: module.variables,
        varfiles: module.varfile ? [module.varfile] : undefined,
      },
    }
  },
}

interface KubernetesStatusDetail {
  remoteResources: KubernetesServerResource[]
}

export type KubernetesServiceStatus = ServiceStatus<KubernetesStatusDetail>

function composeKubernetesDeployStatus({
  action,
  deployedMode,
  state,
  remoteResources,
  forwardablePorts,
  log,
}: {
  action: KubernetesDeployAction
  deployedMode: ActionMode
  state: DeployState
  remoteResources: KubernetesResource[]
  forwardablePorts: ForwardablePort[]
  provider: KubernetesProvider
  log: Log
}) {
  return {
    state: deployStateToActionState(state),
    detail: {
      forwardablePorts,
      state,
      version: state === "ready" ? action.versionString(log) : undefined,
      detail: { remoteResources },
      mode: deployedMode,
      ingresses: getK8sIngresses(remoteResources),
    },
    // TODO-0.13.1
    outputs: {},
  }
}

function isOutdated({
  action,
  deployedMetadata,
  log,
}: {
  action: ResolvedDeployAction
  deployedMetadata: ParsedMetadataManifestData
  log: Log
}): boolean {
  const spec = action.getSpec()
  const actionMode = action.mode()
  const deployedMode = deployedMetadata.mode

  if (deployedMetadata.resolvedVersion !== action.versionString(log)) {
    return true
  } else if (actionMode === "sync" && spec.sync?.paths && deployedMode !== "sync") {
    return true
  } else if (actionMode === "default" && deployedMode !== actionMode) {
    return true
  }
  return false
}

async function getResourceStatuses({
  deployedMetadata,
  namespace,
  api,
  log,
}: {
  deployedMetadata: ParsedMetadataManifestData
  namespace: string
  api: KubeApi
  log: ActionLog
}): Promise<ResourceStatus[]> {
  const manifestMetadata = Object.values(deployedMetadata.manifestMetadata)
  if (manifestMetadata.length === 0) {
    return []
  }

  const maybeDeployedResources: [ManifestMetadata, KubernetesResource | null][] = await Promise.all(
    manifestMetadata.map(async (m) => {
      return [m, await api.readOrNull({ log, ...m })]
    })
  )

  return Promise.all(
    maybeDeployedResources.map(async ([m, resource]) => {
      if (!resource) {
        const missingResource: KubernetesResource = {
          apiVersion: m.apiVersion,
          kind: m.kind,
          metadata: { name: m.name, namespace: m.namespace },
        }
        return { resource: missingResource, state: "missing" } as ResourceStatus
      }

      // TODO: consider removing this quickfix once we have implemented generic manifests/resources comparison
      // Check if the "garden.io/manifest-hash" annotation is a valid sha256 hash.
      // If it's not, consider the remote resource as outdated.
      // AEC feature uses a dummy non-sha256 value to ensure the outdated state.
      const manifestHash = resource.metadata?.annotations?.[k8sManifestHashAnnotationKey]
      if (manifestHash && !isSha256(manifestHash)) {
        return { resource, state: "outdated" } as ResourceStatus
      }

      return await resolveResourceStatus({ api, namespace, waitForJobs: false, resource, log })
    })
  )
}

export const getKubernetesDeployStatus: DeployActionHandler<"getStatus", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
    skipCreate: true,
  })
  const defaultNamespace = namespaceStatus.namespaceName
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // Note: This is analogous to how we version check Helm charts, i.e. we don't check every resource individually.
  // Users can always force deploy, much like with Helm Deploys.
  const metadataManifest = getMetadataManifest({ action, defaultNamespace, declaredManifests: [], log })
  const remoteMetadataResource = await getDeployedResource(ctx, provider, metadataManifest, log)

  if (!remoteMetadataResource) {
    return composeKubernetesDeployStatus({
      action,
      deployedMode: "default",
      state: "missing",
      remoteResources: [],
      forwardablePorts: [],
      provider,
      log,
    })
  }

  const deployedMetadata = parseMetadataResource(log, remoteMetadataResource)
  const deployedMode = deployedMetadata.mode

  try {
    const resourceStatuses = await getResourceStatuses({
      deployedMetadata,
      namespace: defaultNamespace,
      api,
      log,
    })

    const remoteResources: KubernetesResource[] = resourceStatuses
      .filter((rs) => rs.state !== "missing")
      .map((rs) => rs.resource)

    const forwardablePorts = getForwardablePorts({
      resources: remoteResources,
      parentAction: action,
    })

    const state: DeployState = isOutdated({
      action,
      deployedMetadata,
      log,
    })
      ? "outdated"
      : resolveResourceStatuses(log, resourceStatuses)

    return composeKubernetesDeployStatus({
      action,
      deployedMode,
      state,
      remoteResources,
      forwardablePorts,
      provider,
      log,
    })
  } catch (error) {
    log.debug({ msg: `Failed querying for remote resources: ${error}` })
    return composeKubernetesDeployStatus({
      action,
      deployedMode,
      state: "unknown",
      remoteResources: [],
      forwardablePorts: [],
      provider,
      log,
    })
  }
}

export const kubernetesDeploy: DeployActionHandler<"deploy", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log } = params

  const spec = action.getSpec()

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const attached = false

  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })
  const namespace = namespaceStatus.namespaceName

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  // Ensure secrets are created in the target namespace
  const secrets = [...provider.config.copySecrets, ...provider.config.imagePullSecrets]
  await prepareSecrets({ api, namespace, secrets, log })

  // We separate out manifests for namespace resources, since we don't want to apply a prune selector
  // when applying them.
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    // Don't prune namespaces
    await apply({ log, ctx, api, provider, manifests: namespaceManifests, applyArgs: spec.applyArgs })
    await waitForResources({
      namespace,
      ctx,
      provider,
      logContext: action.key(),
      resources: namespaceManifests,
      log,
      timeoutSec: action.getConfig("timeout"),
      waitForJobs: spec.waitForJobs,
    })
  }

  let preparedManifests = manifests

  const mode = action.mode()
  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  if (otherManifests.length > 0) {
    if (mode === "sync" && spec.sync) {
      const configured = await configureSpecialModesForManifests({
        ctx: k8sCtx,
        log,
        action,
        manifests,
      })
      preparedManifests = configured.manifests
    }

    // TODO: Similarly to `container` deployments, check if immutable fields have changed (and delete before
    // redeploying, unless in a production environment).
    await apply({
      log,
      ctx,
      api,
      provider: k8sCtx.provider,
      manifests: preparedManifests,
      pruneLabels,
      applyArgs: spec.applyArgs,
    })
    await waitForResources({
      namespace,
      ctx,
      provider,
      logContext: action.key(),
      resources: preparedManifests,
      log,
      timeoutSec: action.getConfig("timeout"),
      waitForJobs: spec.waitForJobs,
    })
  }
  const status = await getKubernetesDeployStatus(<any>params)

  // Update the namespace AEC annotations
  await updateNamespaceAecAnnotations({ ctx: k8sCtx, api, namespace, status: "none" })

  // Make sure port forwards work after redeployment
  killPortForwards(action, status.detail?.forwardablePorts || [], log)

  ctx.events.emit("namespaceStatus", namespaceStatus)

  if (namespaceManifests.length > 0) {
    for (const ns of namespaceManifests) {
      ctx.events.emit("namespaceStatus", {
        pluginName: provider.name,
        namespaceName: ns.metadata.name,
        state: "ready",
      })
    }
  }

  return {
    ...status,
    detail: status.detail!,
    // Tell the framework that the mutagen process is attached, if applicable
    attached,
  }
}

export const deleteKubernetesDeploy: DeployActionHandler<"delete", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  /**
   * We separate out manifests for namespace resources, since we need to delete each of them by name.
   *
   * Unlike other resources, Garden annotates namespace resources with their name - see `getManifests` for a discussion
   * of this.
   */
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    await deleteNamespaces({ namespaces: namespaceManifests.map((ns) => ns.metadata.name), api, ctx, log })
  }
  if (otherManifests.length > 0) {
    await deleteObjectsBySelector({
      log,
      ctx,
      provider,
      namespace,
      selector: `${gardenAnnotationKey("service")}=${action.name}`,
      objectTypes: uniq(manifests.map((m) => m.kind)),
      includeUninitialized: false,
    })
  }

  const status: KubernetesServiceStatus = { state: "missing", detail: { remoteResources: [] } }

  if (namespaceManifests.length > 0) {
    for (const ns of namespaceManifests) {
      ctx.events.emit("namespaceStatus", {
        namespaceName: ns.metadata.name,
        state: "missing",
        pluginName: provider.name,
      })
    }
  }

  return {
    state: "not-ready",
    detail: status,
    outputs: {},
  }
}

export const getKubernetesDeployLogs: DeployActionHandler<"getLogs", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, ctx, provider)
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  return streamK8sLogs({
    ...params,
    provider,
    actionName: action.name,
    defaultNamespace: namespace,
    resources: manifests,
  })
}

/**
 * Looks for a sync-mode target in a list of manifests.
 * If found, the target is either configured for sync-mode
 * or annotated with `sync-mode: false`.
 *
 * Returns the manifests with the original resource replaced by the modified spec.
 *
 * No-op if no target is found and sync-mode is not enabled.
 */
async function configureSpecialModesForManifests({
  ctx,
  log,
  action,
  manifests,
}: {
  ctx: KubernetesPluginContext
  log: ActionLog
  action: Resolved<KubernetesDeployAction>
  manifests: KubernetesResource<BaseResource>[]
}) {
  const spec = action.getSpec()
  const mode = action.mode()

  if (mode === "sync" && spec.sync && !isEmpty(spec.sync)) {
    // The "sync-mode" annotation is already set.
    return configureSyncMode({
      ctx,
      log,
      provider: ctx.provider,
      action,
      defaultTarget: spec.defaultTarget,
      manifests,
      spec: spec.sync,
    })
  } else {
    // Nothing to do, so we return the original manifests
    return { manifests, updated: [] }
  }
}
