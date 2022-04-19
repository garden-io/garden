/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { ConfigurationError } from "../../exceptions"
import { ServiceStatus, ServiceIngress, ServiceProtocol } from "../../types/service"
import { getNamespaceStatus } from "../kubernetes/namespace"
import { findByName, sleep } from "../../util/util"
import { KubeApi } from "../kubernetes/api"
import { waitForResources } from "../kubernetes/status/status"
import { checkWorkloadStatus } from "../kubernetes/status/workload"
import { createGardenPlugin } from "../../plugin/plugin"
import { faasCliSpec } from "./faas-cli"
import { streamK8sLogs } from "../kubernetes/logs"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../types/plugin/service/getServiceStatus"
import { GetServiceLogsParams } from "../../types/plugin/service/getServiceLogs"
import { DeleteServiceParams } from "../../types/plugin/service/deleteService"
import { HelmModuleConfig } from "../kubernetes/helm/moduleConfig"
import { DEFAULT_API_VERSION, STATIC_DIR } from "../../constants"
import { ExecModuleConfig } from "../exec/moduleConfig"
import { ConfigureProviderParams, ConfigureProviderResult } from "../../plugin/handlers/provider/configureProvider"
import { KubernetesDeployment } from "../kubernetes/types"
import {
  configSchema,
  OpenFaasConfig,
  OpenFaasModule,
  OpenFaasProvider,
  OpenFaasPluginContext,
  OpenFaasService,
  getServicePath,
  configureModule,
  openfaasModuleOutputsSchema,
  openfaasModuleSpecSchema,
  getExternalGatewayUrl,
  getOpenfaasModuleOutputs,
} from "./config"
import { buildOpenfaasAction, getOpenfaasBuildStatus, prepare, stackFilename } from "./build"
import { dedent } from "../../util/string"
import { LogEntry } from "../../logger/log-entry"
import { ProviderMap } from "../../config/provider"
import { parse } from "url"
import { trim } from "lodash"
import { getGitHubUrl } from "../../docs/common"
import { PluginContext } from "../../plugin-context"
import { getK8sProvider } from "../kubernetes/util"
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubernetes/kubectl"
import { openfaasBuildActionSchema, openfaasDeployActionSchema, OpenfaasDeployConfig, openfaasDeployOutputsSchema } from "./actions"
import { ExecBuildConfig, ExecTestConfig } from "../exec/config"
import { ConvertModuleParams } from "../../plugin/handlers/module/convert"

async function getServiceLogs(params: GetServiceLogsParams<OpenFaasModule>) {
  const { ctx, log, service } = params
  const namespace = await getFunctionNamespace(
    log,
    ctx,
    ctx.provider.config as OpenFaasConfig,
    ctx.provider.dependencies
  )

  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const api = await KubeApi.factory(log, ctx, k8sProvider)
  const resources = await getResources(api, service, namespace)

  return streamK8sLogs({ ...params, provider: k8sProvider, defaultNamespace: namespace, resources })
}

const faasNetesInitTimeout = 10000
const retryWait = 1000

async function deployService(params: DeployServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
  const { ctx, module, service, log, runtimeContext } = params
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  // write the stack file again with environment variables
  const envVars = { ...runtimeContext.envVars, ...module.spec.env }
  await prepare({ ctx, log, provider: <OpenFaasProvider>ctx.provider, k8sProvider, action, envVars })

  // use faas-cli to do the deployment
  const start = new Date().getTime()

  while (true) {
    try {
      await ctx.tools["openfaas.faas-cli"].stdout({
        log,
        cwd: module.buildDependencies["openfaas-templates"].buildPath,
        args: ["deploy", "-f", join(module.buildPath, stackFilename), "--handler", module.buildPath],
      })
      break
    } catch (err) {
      const now = new Date().getTime()

      // Retry a few times in case faas-netes is still initializing
      if (err.all?.includes("failed to deploy with status code: 503") && now - start < faasNetesInitTimeout * 1000) {
        await sleep(retryWait)
        continue
      } else {
        throw err
      }
    }
  }

  // wait until deployment is ready
  const namespace = await getFunctionNamespace(
    log,
    ctx,
    ctx.provider.config as OpenFaasConfig,
    ctx.provider.dependencies
  )
  const api = await KubeApi.factory(log, ctx, k8sProvider)
  const resources = await getResources(api, service, namespace)

  await waitForResources({
    namespace,
    ctx,
    provider: k8sProvider,
    serviceName: service.name,
    log,
    resources,
    timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
  })

  // TODO: avoid duplicate work here
  return getServiceStatus(params)
}

async function deleteService(params: DeleteServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
  const { ctx, log, service } = params
  let status: ServiceStatus
  let found = true

  try {
    status = await getServiceStatus({
      ctx,
      log,
      service,
      runtimeContext: {
        envVars: {},
        dependencies: [],
      },
      module: service.module,
      devMode: false,
      hotReload: false,
    })

    found = !!status.state

    const k8sProvider = getK8sProvider(ctx.provider.dependencies)
    await prepare({
      ctx,
      log,
      provider: <OpenFaasProvider>ctx.provider,
      k8sProvider,
      module: service.module,
      envVars: {},
    })

    const module = service.module

    await ctx.tools["openfaas.faas-cli"].stdout({
      log,
      cwd: module.buildDependencies["openfaas-templates"].buildPath,
      args: ["remove", "-f", join(module.buildPath, stackFilename), "--handler", module.buildPath],
    })
  } catch (err) {
    found = false
    status = { state: "missing", detail: {} }
  }

  if (log) {
    found ? log.setSuccess("Service deleted") : log.setWarn("Service not deployed")
  }

  return status
}

async function getResources(api: KubeApi, service: OpenFaasService, namespace: string) {
  const deployment = await api.apps.readNamespacedDeployment(service.name, namespace)
  return [deployment]
}

async function getServiceStatus({
  ctx,
  module,
  service,
  log,
}: GetServiceStatusParams<OpenFaasModule>): Promise<ServiceStatus> {
  const openFaasCtx = <OpenFaasPluginContext>ctx
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  const gatewayUrl = getExternalGatewayUrl(openFaasCtx)
  const parsed = parse(gatewayUrl)
  const protocol = trim(parsed.protocol!, ":") as ServiceProtocol

  const ingresses: ServiceIngress[] = [
    {
      hostname: parsed.hostname!,
      path: getServicePath(module),
      port: protocol === "https" ? 443 : 80,
      protocol,
    },
  ]

  const namespace = await getFunctionNamespace(
    log,
    openFaasCtx,
    openFaasCtx.provider.config,
    openFaasCtx.provider.dependencies
  )
  const api = await KubeApi.factory(log, ctx, k8sProvider)

  let deployment: KubernetesDeployment

  try {
    deployment = await api.apps.readNamespacedDeployment(service.name, namespace)
  } catch (err) {
    if (err.statusCode === 404) {
      return { state: "missing", detail: {} }
    } else {
      throw err
    }
  }

  const container = findByName(deployment.spec.template?.spec?.containers || [], service.name)
  const envVersion = findByName<any>(container?.env || [], "GARDEN_VERSION")
  const version = envVersion ? envVersion.value : undefined
  const resourceVersion = parseInt(deployment.metadata.resourceVersion!, 10)
  const status = await checkWorkloadStatus({
    api,
    namespace,
    resource: deployment,
    log,
    resourceVersion,
  })

  return {
    state: status.state,
    version,
    ingresses,
    detail: {},
  }
}

export async function getFunctionNamespace(
  log: LogEntry,
  ctx: PluginContext,
  config: OpenFaasConfig,
  dependencies: ProviderMap
) {
  // Check for configured namespace in faas-netes custom values
  return (
    (config.values && config.values.functionNamespace) ||
    // Default to K8s app namespace
    (
      await getNamespaceStatus({
        log,
        ctx,
        provider: getK8sProvider(dependencies),
        skipCreate: true,
      })
    ).namespaceName
  )
}
