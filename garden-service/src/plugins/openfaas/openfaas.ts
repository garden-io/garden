/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import * as Joi from "joi"
import { join } from "path"
import { resolve as urlResolve } from "url"
import { ConfigurationError } from "../../exceptions"
import { PluginContext } from "../../plugin-context"
import { joiArray, PrimitiveMap, joiProviderName } from "../../config/common"
import { Module } from "../../types/module"
import { ConfigureProviderResult } from "../../types/plugin/outputs"
import { ServiceStatus, ServiceIngress, Service } from "../../types/service"
import {
  ExecModuleSpec,
  execModuleSpecSchema,
  ExecTestSpec,
  testExecModule,
  getExecModuleBuildStatus,
} from "../exec"
import { KubernetesProvider } from "../kubernetes/config"
import { getNamespace, getAppNamespace } from "../kubernetes/namespace"
import { dumpYaml, findByName } from "../../util/util"
import { KubeApi } from "../kubernetes/api"
import { waitForResources, checkWorkloadStatus } from "../kubernetes/status"
import { CommonServiceSpec } from "../../config/service"
import { GardenPlugin } from "../../types/plugin/plugin"
import { Provider, providerConfigBaseSchema, ProviderConfig } from "../../config/provider"
import { faasCli } from "./faas-cli"
import { getAllLogs } from "../kubernetes/logs"
import { LogEntry } from "../../logger/log-entry"
import { BuildModuleParams } from "../../types/plugin/module/build"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../types/plugin/service/getServiceStatus"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../types/plugin/module/configure"
import { GetServiceLogsParams } from "../../types/plugin/service/getServiceLogs"
import { DeleteServiceParams } from "../../types/plugin/service/deleteService"
import { HelmModuleConfig } from "../kubernetes/helm/config"
import { keyBy, union } from "lodash"
import { DEFAULT_API_VERSION } from "../../constants"
import { ExecModuleConfig } from "../exec"
import { ConfigureProviderParams } from "../../types/plugin/provider/configureProvider"
import { KubernetesDeployment } from "../kubernetes/types"

export const stackFilename = "stack.yml"

export interface OpenFaasModuleSpec extends ExecModuleSpec {
  handler: string
  image: string
  lang: string
}

export const openfaasModuleSpecSchema = execModuleSpecSchema
  .keys({
    dependencies: joiArray(Joi.string())
      .description("The names of services/functions that this function depends on at runtime."),
    handler: Joi.string()
      .default(".")
      .uri((<any>{ relativeOnly: true }))
      .description("Specify which directory under the module contains the handler file/function."),
    image: Joi.string()
      .description("The image name to use for the built OpenFaaS container (defaults to the module name)"),
    lang: Joi.string()
      .required()
      .description("The OpenFaaS language template to use to build this function."),
  })
  .unknown(false)
  .description("The module specification for an OpenFaaS module.")

export interface OpenFaasModule extends Module<OpenFaasModuleSpec, CommonServiceSpec, ExecTestSpec> { }
export type OpenFaasModuleConfig = OpenFaasModule["_ConfigType"]
export interface OpenFaasService extends Service<OpenFaasModule> { }

export interface OpenFaasConfig extends ProviderConfig {
  hostname: string
}

export const configSchema = providerConfigBaseSchema
  .keys({
    name: joiProviderName("openfaas"),
    hostname: Joi.string()
      .hostname()
      .description(dedent`
        The hostname to configure for the function gateway.
        Defaults to the default hostname of the configured Kubernetes provider.

        Important: If you have other types of services, this should be different from their ingress hostnames,
        or the other services should not expose paths under /function and /system to avoid routing conflicts.`,
      )
      .example("functions.mydomain.com"),
  })

type OpenFaasProvider = Provider<OpenFaasConfig>
type OpenFaasPluginContext = PluginContext<OpenFaasConfig>

async function describeType() {
  return {
    docs: dedent`
      Deploy [OpenFaaS](https://www.openfaas.com/) functions using Garden. Requires either the \`kubernetes\` or
      \`local-kubernetes\` provider to be configured. Everything else is installed automatically.
    `,
    schema: openfaasModuleSpecSchema,
  }
}

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
        getBuildStatus: getExecModuleBuildStatus,
        build: buildModule,
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
  path: __dirname,
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
  { log, config, projectName, dependencies, configStore }: ConfigureProviderParams<OpenFaasConfig>,
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
    configStore,
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
    path: __dirname,
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
      version: "1.7.0",
      releaseName,
      values: {
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
        faasnetesd: {
          imagePullPolicy: "IfNotPresent",
        },
        securityContext: false,
      },
    },
  }

  const moduleConfigs = [systemModule, templateModuleConfig]

  return { config, moduleConfigs }
}

async function configureModule(
  { ctx, log, moduleConfig }: ConfigureModuleParams<OpenFaasModule>,
): Promise<ConfigureModuleResult> {
  moduleConfig.build.dependencies.push({
    name: "templates",
    plugin: ctx.provider.name,
    copy: [{
      source: "template",
      target: ".",
    }],
  })

  const dependencies = [`${ctx.provider.name}--system`]

  moduleConfig.serviceConfigs = [{
    dependencies,
    hotReloadable: false,
    name: moduleConfig.name,
    spec: {
      name: moduleConfig.name,
      dependencies,
    },
  }]

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: union(t.dependencies, dependencies),
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.outputs = {
    endpoint: await getInternalServiceUrl(<OpenFaasPluginContext>ctx, log, moduleConfig),
  }

  return moduleConfig
}

async function buildModule({ ctx, log, module }: BuildModuleParams<OpenFaasModule>) {
  await writeStackFile(<OpenFaasProvider>ctx.provider, module, {})

  const buildLog = await faasCli.stdout({
    log,
    cwd: module.buildPath,
    args: ["build", "-f", stackFilename],
  })

  return { fresh: true, buildLog }
}

async function getServiceLogs(params: GetServiceLogsParams<OpenFaasModule>) {
  const { ctx, log, service } = params
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const context = k8sProvider.config.context
  const namespace = await getAppNamespace(ctx, log, k8sProvider)

  const api = await KubeApi.factory(log, k8sProvider.config.context)
  const resources = await getResources(api, service, namespace)

  return getAllLogs({ ...params, context, namespace, resources })
}

async function deployService(params: DeployServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
  const { ctx, module, service, log, runtimeContext } = params

  // write the stack file again with environment variables
  await writeStackFile(<OpenFaasProvider>ctx.provider, module, runtimeContext.envVars)

  // use faas-cli to do the deployment
  await faasCli.stdout({
    log,
    cwd: module.buildPath,
    args: ["deploy", "-f", stackFilename],
  })

  // wait until deployment is ready
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const namespace = await getAppNamespace(ctx, log, k8sProvider)
  const api = await KubeApi.factory(log, k8sProvider.config.context)
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
  const { ctx, log, service, runtimeContext } = params
  let status
  let found = true

  try {
    status = await getServiceStatus({
      ctx,
      log,
      service,
      runtimeContext,
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

async function writeStackFile(
  provider: OpenFaasProvider, module: OpenFaasModule, envVars: PrimitiveMap,
) {
  const image = getImageName(module)

  const stackPath = join(module.buildPath, stackFilename)

  return dumpYaml(stackPath, {
    provider: {
      name: "faas",
      gateway: getExternalGatewayUrl(provider),
    },
    functions: {
      [module.name]: {
        lang: module.spec.lang,
        handler: module.spec.handler,
        image,
        environment: envVars,
      },
    },
  })
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
  const api = await KubeApi.factory(log, k8sProvider.config.context)

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
  const status = await checkWorkloadStatus(api, namespace, deployment, log)

  return {
    state: status.state,
    version,
    ingresses,
  }
}

function getImageName(module: OpenFaasModule) {
  return `${module.name || module.spec.image}:${module.version.versionString}`
}

function getK8sProvider(providers: Provider[]): KubernetesProvider {
  const providerMap = keyBy(providers, "name")
  const provider = <KubernetesProvider>(providerMap["local-kubernetes"] || providerMap.kubernetes)

  if (!provider) {
    throw new ConfigurationError(`openfaas requires a kubernetes (or local-kubernetes) provider to be configured`, {
      configuredProviders: Object.keys(providers),
    })
  }

  return provider
}

function getServicePath(config: OpenFaasModuleConfig) {
  return join("/", "function", config.name)
}

async function getInternalGatewayUrl(ctx: PluginContext<OpenFaasConfig>, log: LogEntry) {
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const namespace = await getNamespace({
    configStore: ctx.configStore,
    log,
    projectName: ctx.projectName,
    provider: k8sProvider,
    skipCreate: true,
  })
  return `http://gateway.${namespace}.svc.cluster.local:8080`
}

function getExternalGatewayUrl(provider: OpenFaasProvider) {
  const k8sProvider = getK8sProvider(provider.dependencies)
  const hostname = provider.config.hostname
  const ingressPort = k8sProvider.config.ingressHttpPort
  return `http://${hostname}:${ingressPort}`
}

async function getInternalServiceUrl(ctx: PluginContext<OpenFaasConfig>, log: LogEntry, config: OpenFaasModuleConfig) {
  return urlResolve(await getInternalGatewayUrl(ctx, log), getServicePath(config))
}
