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
import { joiArray, validate, PrimitiveMap } from "../config/common"
import { Module } from "../types/module"
import { ValidateModuleResult } from "../types/plugin/outputs"
import {
  PrepareEnvironmentParams,
  GetEnvironmentStatusParams,
  ValidateModuleParams,
  DeleteServiceParams,
} from "../types/plugin/params"
import {
  ServiceStatus,
  ServiceIngress,
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
import { GardenPlugin } from "../types/plugin/plugin"
import { deleteContainerService } from "./kubernetes/deployment"
import { Provider, providerConfigBaseSchema } from "../config/project"
import dedent = require("dedent")

const systemProjectPath = join(STATIC_DIR, "openfaas", "system")
const stackFilename = "stack.yml"
const builderWorkDir = "/wd"

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

export interface OpenFaasConfig extends Provider {
  hostname: string
}

const configSchema = providerConfigBaseSchema
  .keys({
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

export function gardenPlugin({ config }: { config: OpenFaasConfig }): GardenPlugin {
  config = validate(config, configSchema, { context: "OpenFaaS provider config" })

  return {
    modules: [join(STATIC_DIR, "openfaas", "builder")],
    actions: {
      async getEnvironmentStatus({ ctx }: GetEnvironmentStatusParams) {
        const ofGarden = await getOpenFaasGarden(ctx)
        const status = await ofGarden.actions.getStatus()
        const envReady = every(values(status.providers).map(s => s.ready))
        const servicesReady = every(values(status.services).map(s => s.state === "ready"))

        return {
          ready: envReady && servicesReady,
          detail: status,
        }
      },

      async prepareEnvironment({ ctx, force }: PrepareEnvironmentParams) {
        // TODO: refactor to dedupe similar code in local-kubernetes
        const ofGarden = await getOpenFaasGarden(ctx)

        await ofGarden.actions.prepareEnvironment({ force })

        const results = await ofGarden.actions.deployServices({})
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
        async validate({ moduleConfig }: ValidateModuleParams<OpenFaasModule>): Promise<ValidateModuleResult> {
          moduleConfig.spec = validate(
            moduleConfig.spec,
            openfaasModuleSpecSchame,
            { context: `module ${moduleConfig.name}` },
          )

          // FIXME: this feels too magicky and convoluted, we should make this type of flow feel more natural
          moduleConfig.build.command = [
            "docker", "run", "-i",
            "-v", `\${modules.${moduleConfig.name}.buildPath}:${builderWorkDir}`,
            "-v", "/var/run/docker.sock:/var/run/docker.sock",
            "--workdir", builderWorkDir,
            `openfaas--builder:\${modules.openfaas--builder.version}`,
            "faas-cli", "build", "-f", stackFilename,
          ]

          moduleConfig.build.dependencies.push({
            name: "builder",
            plugin: "openfaas",
            copy: [],
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

        getBuildStatus: getGenericModuleBuildStatus,

        async build(params: BuildModuleParams<OpenFaasModule>) {
          const { ctx, module } = params

          // prepare the stack.yml file, before handing off the build to the generic handler
          await writeStackFile(ctx, module, {})

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
          const { ctx, module, service, logEntry, runtimeContext } = params

          // write the stack file again with environment variables
          await writeStackFile(ctx, module, runtimeContext.envVars)

          // use faas-cli to do the deployment
          await execa("docker", [
            "run", "-i",
            "-v", `${module.buildPath}:${builderWorkDir}`,
            "-v", "/var/run/docker.sock:/var/run/docker.sock",
            "--workdir", builderWorkDir,
            "--net", "host",
            "openfaas/faas-cli:0.7.3",
            "faas-cli", "deploy", "-f", stackFilename,
          ])

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

          await deleteContainerService({ provider, logEntry, namespace, serviceName: service.name })

          return await getServiceStatus(params)
        },
      },
    },
  }
}

async function writeStackFile(
  ctx: PluginContext, module: OpenFaasModule, envVars: PrimitiveMap,
) {
  const image = getImageName(module)

  const stackPath = join(module.buildPath, stackFilename)

  return dumpYaml(stackPath, {
    provider: {
      name: "faas",
      gateway: getExternalGatewayUrl(ctx),
    },
    functions: {
      [module.name]: {
        lang: module.spec.lang,
        handler: resolve(builderWorkDir, module.spec.handler),
        image,
        environment: envVars,
      },
    },
  })
}

async function getServiceStatus({ ctx, service }: GetServiceStatusParams<OpenFaasModule>) {
  const k8sProvider = getK8sProvider(ctx)

  const ingresses: ServiceIngress[] = [{
    hostname: getExternalGatewayHostname(ctx.provider, k8sProvider),
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
    ingresses,
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
  const k8sProvider = getK8sProvider(ctx)
  const namespace = await getOpenfaasNamespace(ctx, k8sProvider, true)
  return `http://gateway.${namespace}.svc.cluster.local:8080`
}

function getExternalGatewayHostname(provider: OpenFaasProvider, k8sProvider: KubernetesProvider) {
  const hostname = provider.config.hostname || k8sProvider.config.defaultHostname

  if (!hostname) {
    throw new ConfigurationError(
      `openfaas: Must configure hostname if no default hostname is configured on Kubernetes provider.`,
      {
        config: provider,
      },
    )
  }

  return hostname
}

function getExternalGatewayUrl(ctx: PluginContext) {
  const k8sProvider = getK8sProvider(ctx)
  const hostname = getExternalGatewayHostname(ctx.provider, k8sProvider)
  const ingressPort = k8sProvider.config.ingressHttpPort
  return `http://${hostname}:${ingressPort}`
}

async function getInternalServiceUrl(ctx: PluginContext, service: OpenFaasService) {
  return urlResolve(await getInternalGatewayUrl(ctx), getServicePath(service))
}

async function getOpenfaasNamespace(ctx: PluginContext, k8sProvider: KubernetesProvider, skipCreate?: boolean) {
  return getNamespace({ ctx, provider: k8sProvider, skipCreate, suffix: "openfaas" })
}

export async function getOpenFaasGarden(ctx: PluginContext): Promise<Garden> {
  // TODO: figure out good way to retrieve namespace from kubernetes plugin through an exposed interface
  // (maybe allow plugins to expose arbitrary data on the Provider object?)
  const k8sProvider = getK8sProvider(ctx)
  const namespace = await getOpenfaasNamespace(ctx, k8sProvider, true)
  const functionNamespace = await getAppNamespace(ctx, k8sProvider)

  const hostname = getExternalGatewayHostname(ctx.provider, k8sProvider)

  // TODO: allow passing variables/parameters here to be parsed as part of the garden.yml project config
  // (this would allow us to use a garden.yml for the project config, instead of speccing it here)
  return Garden.factory(systemProjectPath, {
    env: "default",
    config: {
      version: "0",
      dirname: "system",
      path: systemProjectPath,
      project: {
        name: `${ctx.projectName}-openfaas`,
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
