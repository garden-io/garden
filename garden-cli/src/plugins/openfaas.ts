/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { join, resolve } from "path"
import { resolve as urlResolve } from "url"
import { STATIC_DIR } from "../constants"
import { PluginError, ConfigurationError } from "../exceptions"
import { Garden } from "../garden"
import { PluginContext } from "../plugin-context"
import { processServices } from "../process"
import { joiArray, validate, PrimitiveMap } from "../config/common"
import { Module } from "../types/module"
import { ParseModuleResult } from "../types/plugin/outputs"
import {
  ConfigureEnvironmentParams,
  GetEnvironmentStatusParams,
  ParseModuleParams,
  DeleteServiceParams,
} from "../types/plugin/params"
import {
  ServiceStatus,
  ServiceEndpoint,
  Service,
} from "../types/service"
import {
  buildGenericModule,
  GenericModuleSpec,
  genericModuleSpecSchema,
  GenericTestSpec,
  testGenericModule,
  getGenericModuleBuildStatus,
} from "./generic"
import { KubernetesProvider } from "./kubernetes/kubernetes"
import { getNamespace, getAppNamespace } from "./kubernetes/namespace"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  BuildModuleParams,
  GetServiceOutputsParams,
} from "../types/plugin/params"
import { every, values } from "lodash"
import { dumpYaml, findByName } from "../util/util"
import * as execa from "execa"
import { KubeApi } from "./kubernetes/api"
import { waitForObjects, checkDeploymentStatus } from "./kubernetes/status"
import { systemSymbol } from "./kubernetes/system"
import { BaseServiceSpec } from "../config/service"
import { getDeployTasks } from "../tasks/deploy"
import { GardenPlugin, Provider } from "../types/plugin/plugin"
import { deleteContainerService } from "./kubernetes/deployment"
import { ProviderConfig, providerConfigBase } from "../config/project"

const systemProjectPath = join(STATIC_DIR, "openfaas", "system")
const stackFilename = "stack.yml"

export interface OpenFaasModuleSpec extends GenericModuleSpec {
  handler: string
  image: string
  lang: string
}

export const openfaasModuleSpecSchame = genericModuleSpecSchema
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

export interface OpenFaasModule extends Module<OpenFaasModuleSpec, BaseServiceSpec, GenericTestSpec> { }
export interface OpenFaasService extends Service<OpenFaasModule> { }

export interface OpenFaasConfig extends ProviderConfig {
  hostname: string
}

const configSchema = providerConfigBase
  .keys({
    hostname: Joi.string()
      .hostname()
      .description(
        "The hostname to configure for the function gateway. " +
        "Defaults to the default hostname of the configured Kubernetes provider.",
      )
      .example("functions.mydomain.com"),
  })

type OpenFaasProvider = Provider<OpenFaasConfig>

export function gardenPlugin({ config }: { config: OpenFaasConfig }): GardenPlugin {
  config = validate(config, configSchema, { context: "OpenFaaS provider config" })

  return {
    modules: [join(STATIC_DIR, "openfaas", "openfaas-builder")],
    actions: {
      async getEnvironmentStatus({ ctx, provider }: GetEnvironmentStatusParams) {
        const ofGarden = await getOpenFaasGarden(ctx, provider)
        const status = await ofGarden.getPluginContext().getStatus()
        const envReady = every(values(status.providers).map(s => s.configured))
        const servicesReady = every(values(status.services).map(s => s.state === "ready"))

        return {
          configured: envReady && servicesReady,
          detail: status,
        }
      },

      async configureEnvironment({ ctx, provider, force }: ConfigureEnvironmentParams) {
        // TODO: refactor to dedupe similar code in local-kubernetes
        const ofGarden = await getOpenFaasGarden(ctx, provider)
        const ofCtx = ofGarden.getPluginContext()

        await ofCtx.configureEnvironment({ force })

        const services = await ofCtx.getServices()
        const deployTasksForModule = async (module) => getDeployTasks({
          ctx: ofCtx, module, force, forceBuild: false, includeDependants: false,
        })

        const results = await processServices({
          garden: ofGarden,
          ctx: ofCtx,
          services,
          watch: false,
          handler: deployTasksForModule,
        })

        const failed = values(results.taskResults).filter(r => !!r.error).length

        if (failed) {
          throw new PluginError(`openfaas: ${failed} errors occurred when configuring environment`, {
            results,
          })
        }

        return {}
      },
    },
    moduleActions: {
      openfaas: {
        async parseModule({ moduleConfig }: ParseModuleParams<OpenFaasModule>): Promise<ParseModuleResult> {
          moduleConfig.spec = validate(
            moduleConfig.spec,
            openfaasModuleSpecSchame,
            { context: `module ${moduleConfig.name}` },
          )

          // stack.yml is populated in the buildModule handler below
          moduleConfig.build.command = ["./faas-cli", "build", "-f", stackFilename]

          moduleConfig.build.dependencies.push({
            name: "openfaas-builder",
            plugin: "openfaas",
            copy: [
              { source: "*", target: "." },
            ],
          })

          moduleConfig.serviceConfigs = [{
            dependencies: [],
            name: moduleConfig.name,
            outputs: {},
            spec: {
              name: moduleConfig.name,
              dependencies: [],
              outputs: {},
            },
          }]

          moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
            name: t.name,
            dependencies: t.dependencies,
            spec: t,
            timeout: t.timeout,
          }))

          return moduleConfig
        },

        getModuleBuildStatus: getGenericModuleBuildStatus,

        async buildModule(params: BuildModuleParams<OpenFaasModule>) {
          const { ctx, provider, module } = params

          // prepare the stack.yml file, before handing off the build to the generic handler
          await writeStackFile(ctx, provider, module, {})

          return buildGenericModule(params)
        },

        // TODO: design and implement a proper test flow for openfaas functions
        testModule: testGenericModule,

        getServiceStatus,

        async getServiceOutputs({ ctx, service }: GetServiceOutputsParams<OpenFaasModule>) {
          return {
            endpoint: await getInternalServiceUrl(ctx, service),
          }
        },

        async deployService(params: DeployServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
          const { ctx, provider, module, service, logEntry, runtimeContext } = params

          // write the stack file again with environment variables
          await writeStackFile(ctx, provider, module, runtimeContext.envVars)

          // use faas-cli to do the deployment
          await execa("./faas-cli", ["deploy", "-f", stackFilename], {
            cwd: module.buildPath,
          })

          // wait until deployment is ready
          const k8sProvider = getK8sProvider(ctx)
          const namespace = await getAppNamespace(ctx, k8sProvider)
          const api = new KubeApi(k8sProvider)

          const deployment = (await api.apps.readNamespacedDeployment(service.name, namespace)).body

          await waitForObjects({ ctx, provider: k8sProvider, service, logEntry, objects: [deployment] })

          // TODO: avoid duplicate work here
          return getServiceStatus(params)
        },

        async deleteService(params: DeleteServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
          const { ctx, logEntry, service } = params
          const provider = getK8sProvider(ctx)
          const namespace = await getAppNamespace(ctx, provider)

          await deleteContainerService({ logEntry, namespace, provider, serviceName: service.name })

          return await getServiceStatus(params)
        },
      },
    },
  }
}

async function writeStackFile(
  ctx: PluginContext, provider: OpenFaasProvider, module: OpenFaasModule, envVars: PrimitiveMap,
) {
  const image = getImageName(module)

  const stackPath = join(module.buildPath, stackFilename)

  return dumpYaml(stackPath, {
    provider: {
      name: "faas",
      gateway: getExternalGatewayUrl(ctx, provider),
    },
    functions: {
      [module.name]: {
        lang: module.spec.lang,
        handler: resolve(module.path, module.spec.handler),
        image,
        environment: envVars,
      },
    },
  })
}

async function getServiceStatus({ ctx, provider, service }: GetServiceStatusParams<OpenFaasModule>) {
  const k8sProvider = getK8sProvider(ctx)

  const endpoints: ServiceEndpoint[] = [{
    name: "default",
    hostname: getExternalGatewayHostname(provider, k8sProvider),
    path: getServicePath(service),
    port: k8sProvider.config.ingressHttpPort,
    protocol: "http",
  }]

  const namespace = await getAppNamespace(ctx, k8sProvider)
  const api = new KubeApi(k8sProvider)

  let deployment

  try {
    deployment = (await api.apps.readNamespacedDeployment(service.name, namespace)).body
  } catch (err) {
    if (err.code === 404) {
      return {}
    } else {
      throw err
    }
  }

  const container: any = findByName(deployment.spec.template.spec.containers, "hello-function")
  const version = findByName<any>(container.env, "GARDEN_VERSION").value
  const status = await checkDeploymentStatus(api, namespace, deployment)

  return {
    state: status.state,
    version,
    endpoints,
  }
}

function getImageName(module: OpenFaasModule) {
  return `${module.name || module.spec.image}:${module.version.versionString}`
}

// NOTE: we're currently not using the CRD/operator, but might change that in the future
//
// async function createFunctionObject(service: OpenFaasService, namespace: string): Promise<KubernetesObject> {
//   const image = await getImageName(service.module)

//   return {
//     apiVersion: "openfaas.com/v1alpha2",
//     kind: "Function",
//     metadata: {
//       name: service.name,
//       namespace,
//     },
//     spec: {
//       name: service.name,
//       image,
//       labels: {
//         "com.openfaas.scale.min": "1",
//         "com.openfaas.scale.max": "5",
//       },
//       environment: {
//         write_debug: "true",
//       },
//       limits: {
//         cpu: DEFAULT_CPU_LIMIT,
//         memory: DEFAULT_MEMORY_LIMIT,
//       },
//       requests: {
//         cpu: DEFAULT_CPU_REQUEST,
//         memory: DEFAULT_MEMORY_REQUEST,
//       },
//     },
//   }
// }

function getK8sProvider(ctx: PluginContext): KubernetesProvider {
  const provider = ctx.providers["local-kubernetes"] || ctx.providers.kubernetes

  if (!provider) {
    throw new ConfigurationError(`openfaas requires a kubernetes (or local-kubernetes) provider to be configured`, {
      configuredProviders: Object.keys(ctx.providers),
    })
  }

  return provider
}

function getServicePath(service: OpenFaasService) {
  return join("/", "function", service.name)
}

async function getInternalGatewayUrl(ctx: PluginContext) {
  const provider = getK8sProvider(ctx)
  const namespace = await getOpenfaasNamespace(ctx, provider, true)
  return `http://gateway.${namespace}.svc.cluster.local:8080`
}

function getExternalGatewayHostname(provider: OpenFaasProvider, k8sProvider: KubernetesProvider) {
  const hostname = provider.config.hostname || k8sProvider.config.defaultHostname

  if (!hostname) {
    throw new ConfigurationError(
      `openfaas: Must configure hostname if no default hostname is configured on Kubernetes provider.`,
      {
        config: provider.config,
      },
    )
  }

  return hostname
}

function getExternalGatewayUrl(ctx: PluginContext, provider: OpenFaasProvider) {
  const k8sProvider = getK8sProvider(ctx)
  const hostname = getExternalGatewayHostname(provider, k8sProvider)
  const ingressPort = k8sProvider.config.ingressHttpPort
  return `http://${hostname}:${ingressPort}`
}

async function getInternalServiceUrl(ctx: PluginContext, service: OpenFaasService) {
  return urlResolve(await getInternalGatewayUrl(ctx), getServicePath(service))
}

async function getOpenfaasNamespace(ctx: PluginContext, provider: KubernetesProvider, skipCreate?: boolean) {
  return getNamespace({ ctx, provider, skipCreate, suffix: "openfaas" })
}

export async function getOpenFaasGarden(ctx: PluginContext, provider: OpenFaasProvider): Promise<Garden> {
  // TODO: figure out good way to retrieve namespace from kubernetes plugin through an exposed interface
  // (maybe allow plugins to expose arbitrary data on the Provider object?)
  const k8sProvider = getK8sProvider(ctx)
  const namespace = await getOpenfaasNamespace(ctx, k8sProvider, true)
  const functionNamespace = await getAppNamespace(ctx, k8sProvider)

  const hostname = getExternalGatewayHostname(provider, k8sProvider)

  // TODO: allow passing variables/parameters here to be parsed as part of the garden.yml project config
  // (this would allow us to use a garden.yml for the project config, instead of speccing it here)
  return Garden.factory(systemProjectPath, {
    env: "default",
    config: {
      version: "0",
      dirname: "system",
      path: systemProjectPath,
      project: {
        name: "garden-openfaas-system",
        environmentDefaults: {
          providers: [],
          variables: {},
        },
        defaultEnvironment: "default",
        environments: [
          {
            name: "default",
            providers: [
              {
                ...k8sProvider.config,
                namespace,
                // TODO: this is clumsy, we should find a better way to configure this
                _system: systemSymbol,
              },
            ],
            variables: {
              "function-namespace": functionNamespace,
              "gateway-hostname": hostname,
            },
          },
        ],
      },
    },
  })
}
