/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { readFile } from "fs-extra"
import Bluebird from "bluebird"
import { flatten, set, uniq } from "lodash"
import { safeLoadAll } from "js-yaml"

import { KubernetesModule, configureKubernetesModule, KubernetesService } from "./config"
import { getNamespace, getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { KubernetesResource, KubernetesServerResource } from "../types"
import { ServiceStatus } from "../../../types/service"
import { compareDeployedResources, waitForResources } from "../status/status"
import { KubeApi } from "../api"
import { ModuleAndRuntimeActionHandlers } from "../../../types/plugin/plugin"
import { getAllLogs } from "../logs"
import { deleteObjectsBySelector, apply } from "../kubectl"
import { BuildModuleParams, BuildResult } from "../../../types/plugin/module/build"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { GetServiceLogsParams } from "../../../types/plugin/service/getServiceLogs"
import { gardenAnnotationKey } from "../../../util/string"
import { getForwardablePorts, getPortForwardHandler, killPortForwards } from "../port-forward"
import { LogEntry } from "../../../logger/log-entry"

export const kubernetesHandlers: Partial<ModuleAndRuntimeActionHandlers<KubernetesModule>> = {
  build,
  configure: configureKubernetesModule,
  deleteService,
  deployService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus,
}

interface KubernetesStatusDetail {
  remoteResources: KubernetesServerResource[]
}

export type KubernetesServiceStatus = ServiceStatus<KubernetesStatusDetail>

async function build({ module }: BuildModuleParams<KubernetesModule>): Promise<BuildResult> {
  // Get the manifests here, just to validate that the files are there and are valid YAML
  await readManifests(module)
  return { fresh: true }
}

async function getServiceStatus({
  ctx,
  module,
  log,
}: GetServiceStatusParams<KubernetesModule>): Promise<KubernetesServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const manifests = await getManifests(api, log, module, namespace)

  const { state, remoteResources } = await compareDeployedResources(k8sCtx, api, namespace, manifests, log)

  const forwardablePorts = getForwardablePorts(remoteResources)

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail: { remoteResources },
  }
}

async function deployService(params: DeployServiceParams<KubernetesModule>): Promise<KubernetesServiceStatus> {
  const { ctx, module, service, log } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)

  const namespace = await getNamespace({
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })

  const manifests = await getManifests(api, log, module, namespace)

  const pruneSelector = getSelector(service)
  await apply({ log, provider: k8sCtx.provider, manifests, pruneSelector })

  await waitForResources({
    ctx: k8sCtx,
    provider: k8sCtx.provider,
    serviceName: service.name,
    resources: manifests,
    log,
  })

  const status = await getServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  return status
}

async function deleteService(params: DeleteServiceParams): Promise<KubernetesServiceStatus> {
  const { ctx, log, service, module } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider)
  const manifests = await getManifests(api, log, module, namespace)

  await deleteObjectsBySelector({
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${service.name}`,
    objectTypes: uniq(manifests.map((m) => m.kind)),
    includeUninitialized: false,
  })

  return { state: "missing", detail: { remoteResources: [] } }
}

async function getServiceLogs(params: GetServiceLogsParams<KubernetesModule>) {
  const { ctx, log, module } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, provider)
  const manifests = await getManifests(api, log, module, namespace)

  return getAllLogs({ ...params, provider, defaultNamespace: namespace, resources: manifests })
}

function getSelector(service: KubernetesService) {
  return `${gardenAnnotationKey("service")}=${service.name}`
}

/**
 * Read the manifests from the module config, as well as any referenced files in the config.
 */
async function readManifests(module: KubernetesModule) {
  const fileManifests = flatten(
    await Bluebird.map(module.spec.files, async (path) => {
      const absPath = resolve(module.buildPath, path)
      return safeLoadAll((await readFile(absPath)).toString())
    })
  )

  return [...module.spec.manifests, ...fileManifests]
}

/**
 * Reads the manifests and makes sure each has a namespace set (when applicable) and adds annotations.
 * Use this when applying to the cluster, or comparing against deployed resources.
 */
async function getManifests(
  api: KubeApi,
  log: LogEntry,
  module: KubernetesModule,
  defaultNamespace: string
): Promise<KubernetesResource[]> {
  const manifests = await readManifests(module)

  return Bluebird.map(manifests, async (manifest) => {
    // Ensure a namespace is set, if not already set, and if required by the resource type
    if (!manifest.metadata.namespace) {
      const info = await api.getApiResourceInfo(log, manifest)

      if (info.namespaced) {
        manifest.metadata.namespace = defaultNamespace
      }
    }

    // Set Garden annotations
    set(manifest, ["metadata", "annotations", gardenAnnotationKey("service")], module.name)
    set(manifest, ["metadata", "labels", gardenAnnotationKey("service")], module.name)

    return manifest
  })
}
