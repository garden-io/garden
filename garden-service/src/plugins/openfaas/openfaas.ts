/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { ConfigurationError } from "../../exceptions"
import { ServiceStatus, ServiceIngress } from "../../types/service"
import { testExecModule } from "../exec"
import { getNamespace, getAppNamespace } from "../kubernetes/namespace"
import { findByName } from "../../util/util"
import { KubeApi } from "../kubernetes/api"
import { waitForResources } from "../kubernetes/status/status"
import { checkWorkloadStatus } from "../kubernetes/status/workload"
import { GardenPlugin } from "../../types/plugin/plugin"
import { faasCli } from "./faas-cli"
import { getAllLogs } from "../kubernetes/logs"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../types/plugin/service/getServiceStatus"
import { GetServiceLogsParams } from "../../types/plugin/service/getServiceLogs"
import { DeleteServiceParams } from "../../types/plugin/service/deleteService"
import { HelmModuleConfig } from "../kubernetes/helm/config"
import { DEFAULT_API_VERSION, STATIC_DIR } from "../../constants"
import { ExecModuleConfig } from "../exec"
import { ConfigureProviderParams, ConfigureProviderResult } from "../../types/plugin/provider/configureProvider"
import { KubernetesDeployment } from "../kubernetes/types"
import {
  configSchema,
  describeType,
  getK8sProvider,
  OpenFaasConfig,
  OpenFaasModule,
  OpenFaasProvider,
  OpenFaasPluginContext,
  OpenFaasService,
  getServicePath,
  configureModule,
} from "./config"
import { getOpenfaasModuleBuildStatus, buildOpenfaasModule, writeStackFile, stackFilename } from "./build"

const systemDir = join(STATIC_DIR, "openfaas", "system")

export function gardenPlugin(): GardenPlugin {
  return {
    configSchema,
    dependencies: ["kubernetes"],
    actions: {
      configureProvider,
    },
    moduleActions: {
      openfaas: {
        describeType,
        configure: configureModule,
        getBuildStatus: getOpenfaasModuleBuildStatus,
        build: buildOpenfaasModule,
        // TODO: design and implement a proper test flow for openfaas functions
        testModule: testExecModule,
        getServiceStatus,
        getServiceLogs,
        deployService,
        deleteService,
      },
    },
  }
}

const templateModuleConfig: ExecModuleConfig = {
  allowPublish: false,
  apiVersion: DEFAULT_API_VERSION,
  build: {
    dependencies: [],
  },
  description: "OpenFaaS templates for building functions",
  name: "templates",
  path: join(systemDir, "openfaas-templates"),
  repositoryUrl: "https://github.com/openfaas/templates.git#master",
  outputs: {},
  serviceConfigs: [],
  spec: {
    build: {
      command: [],
      dependencies: [],
    },
    env: {},
    tasks: [],
    tests: [],
  },
  taskConfigs: [],
  testConfigs: [],
  type: "exec",
}

async function configureProvider(
  { log, config, projectName, dependencies }: ConfigureProviderParams<OpenFaasConfig>,
): Promise<ConfigureProviderResult> {
  const k8sProvider = getK8sProvider(dependencies)

  if (!config.hostname) {
    if (!k8sProvider.config.defaultHostname) {
      throw new ConfigurationError(
        `openfaas: Must configure hostname if no default hostname is configured on Kubernetes provider.`,
        { config },
      )
    }

    config.hostname = k8sProvider.config.defaultHostname
  }

  const namespace = await getNamespace({
    log,
    provider: k8sProvider,
    projectName,
    skipCreate: true,
  })

  // Need to scope the release name, because the OpenFaaS Helm chart installs some cluster-wide resources
  // that could conflict across projects/users.
  const releaseName = `${namespace}--openfaas`

  const systemModule: HelmModuleConfig = {
    allowPublish: false,
    apiVersion: DEFAULT_API_VERSION,
    build: {
      dependencies: [],
    },
    description: "OpenFaaS runtime",
    name: "system",
    outputs: {},
    path: join(systemDir, "openfaas-system"),
    serviceConfigs: [],
    taskConfigs: [],
    testConfigs: [],
    type: "helm",
    spec: {
      repo: "https://openfaas.github.io/faas-netes/",
      chart: "openfaas",
      chartPath: ".",
      dependencies: [],
      skipDeploy: false,
      tasks: [],
      tests: [],
      timeout: 900,
      version: "4.4.0",
      releaseName,
      values: {
        // TODO: allow setting password in provider config
        basic_auth: false,
        exposeServices: false,
        functionNamespace: namespace,
        ingress: {
          enabled: true,
          hosts: [
            {
              host: config.hostname,
              serviceName: "gateway",
              servicePort: 8080,
              path: "/function/",
            },
            {
              host: config.hostname,
              serviceName: "gateway",
              servicePort: 8080,
              path: "/system/",
            },
          ],
        },
        // TODO: make this (and more stuff) configurable
        faasIdler: {
          create: false,
        },
        faasnetes: {
          imagePullPolicy: "IfNotPresent",
        },
        securityContext: false,
      },
      valueFiles: [],
    },
  }

  const moduleConfigs = [systemModule, templateModuleConfig]

  return { config, moduleConfigs }
}

async function getServiceLogs(params: GetServiceLogsParams<OpenFaasModule>) {
  const { ctx, log, service } = params
  const provider = getK8sProvider(ctx.provider.dependencies)
  const namespace = await getAppNamespace(ctx, log, provider)

  const api = await KubeApi.factory(log, provider)
  const resources = await getResources(api, service, namespace)

  return getAllLogs({ ...params, provider, defaultNamespace: namespace, resources })
}

async function deployService(params: DeployServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
  const { ctx, module, service, log, runtimeContext } = params
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  // write the stack file again with environment variables
  const envVars = { ...runtimeContext.envVars, ...module.spec.env }
  await writeStackFile(<OpenFaasProvider>ctx.provider, k8sProvider, module, envVars)

  // use faas-cli to do the deployment
  await faasCli.stdout({
    log,
    cwd: module.buildPath,
    args: ["deploy", "-f", stackFilename],
  })

  // wait until deployment is ready
  const namespace = await getAppNamespace(ctx, log, k8sProvider)
  const api = await KubeApi.factory(log, k8sProvider)
  const resources = await getResources(api, service, namespace)

  await waitForResources({
    ctx,
    provider: k8sProvider,
    serviceName: service.name,
    log,
    resources,
  })

  // TODO: avoid duplicate work here
  return getServiceStatus(params)
}

async function deleteService(params: DeleteServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
  const { ctx, log, service } = params
  let status
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
      hotReload: false,
    })

    found = !!status.state

    await faasCli.stdout({
      log,
      cwd: service.module.buildPath,
      args: ["remove", "-f", stackFilename],
    })

  } catch (err) {
    found = false
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

async function getServiceStatus({ ctx, module, service, log }: GetServiceStatusParams<OpenFaasModule>) {
  const openFaasCtx = <OpenFaasPluginContext>ctx
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)

  const ingresses: ServiceIngress[] = [{
    hostname: ctx.provider.config.hostname,
    path: getServicePath(module),
    port: k8sProvider.config.ingressHttpPort,
    protocol: "http",
  }]

  const namespace = await getAppNamespace(openFaasCtx, log, k8sProvider)
  const api = await KubeApi.factory(log, k8sProvider)

  let deployment: KubernetesDeployment

  try {
    deployment = await api.apps.readNamespacedDeployment(service.name, namespace)
  } catch (err) {
    if (err.code === 404) {
      return {}
    } else {
      throw err
    }
  }

  const container: any = findByName(deployment.spec.template.spec.containers, service.name)
  const envVersion = findByName<any>(container.env, "GARDEN_VERSION")
  const version = envVersion ? envVersion.value : undefined
  const resourceVersion = parseInt(deployment.metadata.resourceVersion!, 10)
  const status = await checkWorkloadStatus({ api, namespace, resource: deployment, log, resourceVersion })

  return {
    state: status.state,
    version,
    ingresses,
  }
}
