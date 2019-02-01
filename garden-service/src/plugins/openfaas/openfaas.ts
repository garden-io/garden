/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { join } from "path"
import { resolve as urlResolve } from "url"
import { STATIC_DIR } from "../../constants"
import { PluginError, ConfigurationError } from "../../exceptions"
import { Garden } from "../../garden"
import { PluginContext } from "../../plugin-context"
import { joiArray, validate, PrimitiveMap, joiProviderName } from "../../config/common"
import { Module } from "../../types/module"
import { ConfigureModuleResult } from "../../types/plugin/outputs"
import {
  PrepareEnvironmentParams,
  GetEnvironmentStatusParams,
  ConfigureModuleParams,
  DeleteServiceParams,
  GetServiceLogsParams,
} from "../../types/plugin/params"
import {
  ServiceStatus,
  ServiceIngress,
  Service,
} from "../../types/service"
import {
  ExecModuleSpec,
  execModuleSpecSchema,
  ExecTestSpec,
  testExecModule,
  getExecModuleBuildStatus,
} from "../exec"
import { KubernetesProvider } from "../kubernetes/kubernetes"
import { getNamespace, getAppNamespace } from "../kubernetes/namespace"
import {
  DeployServiceParams,
  GetServiceStatusParams,
  BuildModuleParams,
} from "../../types/plugin/params"
import { every, values } from "lodash"
import { dumpYaml, findByName } from "../../util/util"
import { KubeApi } from "../kubernetes/api"
import { waitForResources, checkDeploymentStatus } from "../kubernetes/status"
import { systemSymbol } from "../kubernetes/system"
import { CommonServiceSpec } from "../../config/service"
import { GardenPlugin } from "../../types/plugin/plugin"
import { Provider, providerConfigBaseSchema } from "../../config/project"
import { faasCli } from "./faas-cli"
import { CleanupEnvironmentParams } from "../../types/plugin/params"
import dedent = require("dedent")
import { getKubernetesLogs } from "../kubernetes/logs"
import { installTiller, checkTillerStatus } from "../kubernetes/helm/tiller"

const systemProjectPath = join(STATIC_DIR, "openfaas", "system")
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

export interface OpenFaasConfig extends Provider {
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

export function gardenPlugin(): GardenPlugin {
  return {
    configSchema,
    modules: [join(STATIC_DIR, "openfaas", "templates")],
    actions: {
      async getEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams) {
        const ofGarden = await getOpenFaasGarden(ctx)
        const status = await ofGarden.actions.getStatus({ log })
        const envReady = every(values(status.providers).map(s => s.ready))
        const servicesReady = every(values(status.services).map(s => s.state === "ready"))

        // TODO: get rid of this convoluted nested Garden setup
        const k8sProviderName = getK8sProvider(ctx).name
        const ofCtx = await ofGarden.getPluginContext(k8sProviderName)
        const ofK8sProvider = getK8sProvider(ofCtx)
        const tillerState = await checkTillerStatus(ofCtx, ofK8sProvider, log)

        return {
          ready: envReady && servicesReady && tillerState === "ready",
          detail: status.services,
        }
      },

      async prepareEnvironment({ ctx, force, log }: PrepareEnvironmentParams) {
        // TODO: refactor to dedupe similar code in local-kubernetes
        const ofGarden = await getOpenFaasGarden(ctx)

        await ofGarden.actions.prepareEnvironment({ force, log })

        // TODO: avoid this coupling (requires work on plugin dependencies)
        const k8sProviderName = getK8sProvider(ctx).name
        const ofCtx = await ofGarden.getPluginContext(k8sProviderName)
        const ofK8sProvider = getK8sProvider(ofCtx)
        await installTiller(ctx, ofK8sProvider, log)

        const results = await ofGarden.actions.deployServices({ log, force })
        const failed = values(results.taskResults).filter(r => !!r.error).length

        if (failed) {
          throw new PluginError(`openfaas: ${failed} errors occurred when configuring environment`, {
            results,
          })
        }

        return {}
      },

      async cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams) {
        const ofGarden = await getOpenFaasGarden(ctx)
        await ofGarden.actions.cleanupEnvironment({ log })
        return {}
      },
    },
    moduleActions: {
      openfaas: {
        async configure({ ctx, moduleConfig }: ConfigureModuleParams<OpenFaasModule>): Promise<ConfigureModuleResult> {
          moduleConfig.spec = validate(
            moduleConfig.spec,
            openfaasModuleSpecSchema,
            { context: `module ${moduleConfig.name}` },
          )

          moduleConfig.build.dependencies.push({
            name: "templates",
            plugin: "openfaas",
            copy: [{
              source: "template",
              target: ".",
            }],
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

          moduleConfig.outputs = {
            endpoint: await getInternalServiceUrl(ctx, moduleConfig),
          }

          return moduleConfig
        },

        getBuildStatus: getExecModuleBuildStatus,

        async build({ ctx, log, module }: BuildModuleParams<OpenFaasModule>) {
          await writeStackFile(ctx, module, {})

          const buildLog = await faasCli.stdout({
            log,
            cwd: module.buildPath,
            args: ["build", "-f", stackFilename],
          })

          return { fresh: true, buildLog }
        },

        // TODO: design and implement a proper test flow for openfaas functions
        testModule: testExecModule,

        getServiceStatus,

        async getServiceLogs(params: GetServiceLogsParams<OpenFaasModule>) {
          const { ctx, service } = params
          const k8sProvider = getK8sProvider(ctx)
          const context = k8sProvider.config.context
          const namespace = await getAppNamespace(ctx, k8sProvider)
          const selector = `faas_function=${service.name}`
          return getKubernetesLogs({ ...params, context, namespace, selector })
        },

        async deployService(params: DeployServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
          const { ctx, module, service, log, runtimeContext } = params

          // write the stack file again with environment variables
          await writeStackFile(ctx, module, runtimeContext.envVars)

          // use faas-cli to do the deployment
          await faasCli.stdout({
            log,
            cwd: module.buildPath,
            args: ["deploy", "-f", stackFilename],
          })

          // wait until deployment is ready
          const k8sProvider = getK8sProvider(ctx)
          const namespace = await getAppNamespace(ctx, k8sProvider)
          const api = new KubeApi(k8sProvider)

          const deployment = (await api.apps.readNamespacedDeployment(service.name, namespace)).body

          await waitForResources({
            ctx,
            provider: k8sProvider,
            serviceName: service.name,
            log,
            resources: [deployment],
          })

          // TODO: avoid duplicate work here
          return getServiceStatus(params)
        },

        async deleteService(params: DeleteServiceParams<OpenFaasModule>): Promise<ServiceStatus> {
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
        handler: module.spec.handler,
        image,
        environment: envVars,
      },
    },
  })
}

async function getServiceStatus({ ctx, module, service }: GetServiceStatusParams<OpenFaasModule>) {
  const k8sProvider = getK8sProvider(ctx)

  const ingresses: ServiceIngress[] = [{
    hostname: getExternalGatewayHostname(ctx.provider, k8sProvider),
    path: getServicePath(module),
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

function getServicePath(config: OpenFaasModuleConfig) {
  return join("/", "function", config.name)
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

async function getInternalServiceUrl(ctx: PluginContext, config: OpenFaasModuleConfig) {
  return urlResolve(await getInternalGatewayUrl(ctx), getServicePath(config))
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
    environmentName: "default",
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
              // Need to scope the release name, because the OpenFaaS Helm chart installs some cluster-wide resources
              // that could conflict across projects/users.
              "release-name": `${functionNamespace}--openfaas`,
            },
          },
        ],
      },
    },
  })
}
