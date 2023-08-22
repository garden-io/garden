/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty, omit, partition, uniq } from "lodash"
import type { ModuleActionHandlers } from "../../../plugin/plugin"
import { ServiceStatus } from "../../../types/service"
import { gardenAnnotationKey } from "../../../util/string"
import { KubeApi } from "../api"
import type { KubernetesPluginContext } from "../config"
import { configureSyncMode, convertKubernetesModuleDevModeSpec } from "../sync"
import { apply, deleteObjectsBySelector } from "../kubectl"
import { streamK8sLogs } from "../logs"
import { getActionNamespace, getActionNamespaceStatus } from "../namespace"
import { getForwardablePorts, killPortForwards } from "../port-forward"
import { getK8sIngresses } from "../status/ingress"
import { compareDeployedResources, waitForResources } from "../status/status"
import type { BaseResource, KubernetesResource, KubernetesServerResource, SyncableResource } from "../types"
import { convertServiceResource, gardenNamespaceAnnotationValue, getManifests } from "./common"
import { configureKubernetesModule, KubernetesModule } from "./module-config"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"
import type { ExecBuildConfig } from "../../exec/build"
import type { KubernetesActionConfig, KubernetesDeployAction, KubernetesDeployActionConfig } from "./config"
import type { DeployActionHandler } from "../../../plugin/action-types"
import type { ActionLog } from "../../../logger/log-entry"
import type { Resolved } from "../../../actions/types"
import { deployStateToActionState } from "../../../plugin/handlers/Deploy/get-status"

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

    const files = module.spec.files || []
    const manifests = module.spec.manifests || []

    const deployAction: KubernetesDeployActionConfig = {
      kind: "Deploy",
      type: "kubernetes",
      name: service.name,
      ...params.baseFields,

      build: dummyBuild?.name,
      dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),
      include: module.spec.files,
      timeout: service.spec.timeout,

      spec: {
        ...omit(module.spec, ["name", "build", "dependencies", "serviceResource", "tasks", "tests", "sync", "devMode"]),
        files,
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

      actions.push({
        kind: "Run",
        type: "kubernetes-pod",
        name: task.name,
        description: task.spec.description,
        ...params.baseFields,
        disabled: task.disabled,

        build: dummyBuild?.name,
        dependencies: prepareRuntimeDependencies(task.config.dependencies, dummyBuild),
        timeout: task.spec.timeout,

        spec: {
          ...omit(task.spec, ["name", "description", "dependencies", "disabled", "timeout"]),
          resource,
          files,
          manifests,
          namespace: module.spec.namespace,
        },
      })
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
          files,
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

export const getKubernetesDeployStatus: DeployActionHandler<"getStatus", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const spec = action.getSpec()
  const mode = action.mode()

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
    skipCreate: true,
  })
  const namespace = namespaceStatus.namespaceName
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // FIXME: We're currently reading the manifests from the module source dir (instead of build dir)
  // because the build may not have been staged.
  // This means that manifests added via the `build.dependencies[].copy` field will not be included.
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace, readFromSrcDir: true })
  const prepareResult = await configureSpecialModesForManifests({
    ctx: k8sCtx,
    log,
    action,
    manifests,
  })
  const preparedManifests = prepareResult.manifests

  let {
    state,
    remoteResources,
    mode: deployedMode,
  } = await compareDeployedResources({
    ctx: k8sCtx,
    api,
    namespace,
    manifests: preparedManifests,
    log,
  })

  // Local mode has its own port-forwarding configuration
  const forwardablePorts = deployedMode === "local" ? [] : getForwardablePorts(remoteResources, action)

  if (state === "ready") {
    // Local mode always takes precedence over sync mode
    if (mode === "local" && spec.localMode && deployedMode !== "local") {
      state = "outdated"
    } else if (mode === "sync" && spec.sync?.paths && deployedMode !== "sync") {
      state = "outdated"
    }
  }

  return {
    state: deployStateToActionState(state),
    detail: {
      forwardablePorts,
      state,
      version: state === "ready" ? action.versionString() : undefined,
      detail: { remoteResources },
      mode: deployedMode,
      ingresses: getK8sIngresses(remoteResources),
    },
    // TODO-0.13.1
    outputs: {},
  }
}

export const kubernetesDeploy: DeployActionHandler<"deploy", KubernetesDeployAction> = async (params) => {
  const { ctx, action, log } = params

  const spec = action.getSpec()

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  let attached = false

  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })
  const namespace = namespaceStatus.namespaceName

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  // We separate out manifests for namespace resources, since we don't want to apply a prune selector
  // when applying them.
  const [namespaceManifests, otherManifests] = partition(manifests, (m) => m.kind === "Namespace")

  if (namespaceManifests.length > 0) {
    // Don't prune namespaces
    await apply({ log, ctx, api, provider, manifests: namespaceManifests })
    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: action.key(),
      resources: namespaceManifests,
      log,
      timeoutSec: action.getConfig("timeout"),
      waitForJobs: spec.waitForJobs,
    })
  }

  let modifiedResources: SyncableResource[] = []
  let preparedManifests = manifests

  const mode = action.mode()
  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  if (otherManifests.length > 0) {
    if ((mode === "sync" && spec.sync) || (mode === "local" && spec.localMode)) {
      const configured = await configureSpecialModesForManifests({
        ctx: k8sCtx,
        log,
        action,
        manifests,
      })
      preparedManifests = configured.manifests
      modifiedResources = configured.updated
    }

    // TODO: Similarly to `container` deployments, check if immutable fields have changed (and delete before
    // redeploying, unless in a production environment).
    await apply({ log, ctx, api, provider: k8sCtx.provider, manifests: preparedManifests, pruneLabels })
    await waitForResources({
      namespace,
      ctx,
      provider,
      actionName: action.key(),
      resources: preparedManifests,
      log,
      timeoutSec: action.getConfig("timeout"),
      waitForJobs: spec.waitForJobs,
    })
  }

  const status = await getKubernetesDeployStatus(<any>params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, status.detail?.forwardablePorts || [], log)

  if (modifiedResources.length > 0) {
    // Local mode always takes precedence over sync mode
    if (mode === "local" && spec.localMode) {
      await startServiceInLocalMode({
        ctx,
        spec: spec.localMode,
        targetResource: modifiedResources[0],
        manifests: preparedManifests,
        action,
        namespace,
        log,
      })
      attached = true
    }
  }

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
    await Promise.all(
      namespaceManifests.map((ns) => {
        const selector = `${gardenAnnotationKey("service")}=${gardenNamespaceAnnotationValue(ns.metadata.name)}`
        return deleteObjectsBySelector({
          log,
          ctx,
          provider,
          namespace,
          selector,
          objectTypes: ["Namespace"],
          includeUninitialized: false,
        })
      })
    )
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
    state: "ready",
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
 * Looks for a sync-mode or local-mode target in a list of manifests.
 * If found, the target is either configured for sync-mode/local-mode
 * or annotated with `sync-mode: false`, or `local-mode: false`.
 *
 * Returns the manifests with the original resource replaced by the modified spec.
 *
 * No-op if no target is found and neither sync-mode nor local-mode is enabled.
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

  // Local mode always takes precedence over sync mode
  if (mode === "local" && spec.localMode && !isEmpty(spec.localMode)) {
    // TODO-0.13.0: Support multiple local processes+targets
    // The "local-mode" annotation is set in `configureLocalMode`.
    return await configureLocalMode({
      ctx,
      spec: spec.localMode,
      defaultTarget: spec.defaultTarget,
      manifests,
      action,
      log,
    })
  } else if (mode === "sync" && spec.sync && !isEmpty(spec.sync)) {
    // The "sync-mode" annotation is set in `configureDevMode`.
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
