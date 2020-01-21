/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { join } from "path"
import { resolve as urlResolve } from "url"
import { ConfigurationError } from "../../exceptions"
import { PluginContext } from "../../plugin-context"
import { joiArray, joiProviderName, joi, joiEnvVars, DeepPrimitiveMap } from "../../config/common"
import { Module } from "../../types/module"
import { Service } from "../../types/service"
import { ExecModuleSpecBase, ExecTestSpec } from "../exec"
import { KubernetesProvider } from "../kubernetes/config"
import { CommonServiceSpec } from "../../config/service"
import { Provider, providerConfigBaseSchema, ProviderConfig } from "../../config/provider"
import { keyBy, union } from "lodash"
import { ContainerModule } from "../container/config"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../types/plugin/module/configure"
import { getNamespace } from "../kubernetes/namespace"
import { LogEntry } from "../../logger/log-entry"
import { baseBuildSpecSchema } from "../../config/module"
import { DEFAULT_BUILD_TIMEOUT } from "../container/helpers"
import { baseTestSpecSchema } from "../../config/test"

export interface OpenFaasModuleSpec extends ExecModuleSpecBase {
  handler: string
  image: string
  lang: string
}

// Use the exec test schema but override the command description
const openfaasTestSchema = baseTestSpecSchema.keys({
  command: joi
    .array()
    .items(joi.string())
    .description("The command to run in the module build context in order to test it.")
    .required(),
  env: joiEnvVars(),
})

export const openfaasModuleSpecSchema = joi
  .object()
  .keys({
    build: baseBuildSpecSchema,
    dependencies: joiArray(joi.string()).description(
      "The names of services/functions that this function depends on at runtime."
    ),
    env: joiEnvVars(),
    handler: joi
      .posixPath()
      .subPathOnly()
      .default(".")
      .description("Specify which directory under the module contains the handler file/function."),
    image: joi
      .string()
      .description("The image name to use for the built OpenFaaS container (defaults to the module name)"),
    lang: joi
      .string()
      .required()
      .description("The OpenFaaS language template to use to build this function."),
    tests: joiArray(openfaasTestSchema).description("A list of tests to run in the module."),
  })
  .unknown(false)
  .description("The module specification for an OpenFaaS module.")

export const openfaasModuleOutputsSchema = joi.object().keys({
  endpoint: joi
    .string()
    .uri()
    .required()
    .description(`The full URL to query this service _from within_ the cluster.`),
})

export interface OpenFaasModule extends Module<OpenFaasModuleSpec, CommonServiceSpec, ExecTestSpec> {}
export type OpenFaasModuleConfig = OpenFaasModule["_ConfigType"]
export interface OpenFaasService extends Service<OpenFaasModule> {}

export interface OpenFaasConfig extends ProviderConfig {
  gatewayUrl: string
  hostname: string
  faasNetes: {
    install: boolean
    values: DeepPrimitiveMap
  }
}

export const configSchema = providerConfigBaseSchema.keys({
  name: joiProviderName("openfaas"),
  gatewayUrl: joi
    .string()
    .uri({ scheme: ["http", "https"] })
    .description(
      dedent`
        The external URL to the function gateway, after installation. This is required if you set \`faasNetes.values\`
        or \`faastNetes.install: false\`, so that Garden can know how to reach the gateway.
      `
    )
    .example("https://functions.mydomain.com"),
  hostname: joi
    .string()
    .hostname()
    .description(
      dedent`
        The ingress hostname to configure for the function gateway, when \`faasNetes.install: true\` and not
        overriding \`faasNetes.values\`. Defaults to the default hostname of the configured Kubernetes provider.

        Important: If you have other types of services, this should be different from their ingress hostnames,
        or the other services should not expose paths under /function and /system to avoid routing conflicts.
      `
    )
    .example("functions.mydomain.com"),
  faasNetes: joi
    .object()
    .keys({
      install: joi.boolean().default(true).description(dedent`
        Set to false if you'd like to install and configure faas-netes yourself.
        See the [official instructions](https://docs.openfaas.com/deployment/kubernetes/) for details.
      `),
      values: joi.object().description(dedent`
        Override the values passed to the faas-netes Helm chart. Ignored if \`install: false\`.
        See the [chart docs](https://github.com/openfaas/faas-netes/tree/master/chart/openfaas) for the available
        options.

        Note that this completely replaces the values Garden assigns by default, including \`functionNamespace\`,
        ingress configuration etc. so you need to make sure those are correctly configured for your use case.
      `),
    })
    .default({ install: true }),
})

export type OpenFaasProvider = Provider<OpenFaasConfig>
export type OpenFaasPluginContext = PluginContext<OpenFaasConfig>

export function getK8sProvider(providers: Provider[]): KubernetesProvider {
  const providerMap = keyBy(providers, "name")
  // FIXME: use new plugin inheritance mechanism here, instead of explicitly checking for local-kubernetes
  const provider = <KubernetesProvider>(providerMap["local-kubernetes"] || providerMap.kubernetes)

  if (!provider) {
    throw new ConfigurationError(`openfaas requires a kubernetes (or local-kubernetes) provider to be configured`, {
      configuredProviders: Object.keys(providers),
    })
  }

  return provider
}

export function getContainerModule(module: OpenFaasModule): ContainerModule {
  const containerModule = {
    ...module,
    spec: {
      ...module.spec,
      build: {
        ...module.spec.build,
        timeout: DEFAULT_BUILD_TIMEOUT,
      },
      buildArgs: {},
      dockerfile: "Dockerfile",
      extraFlags: [],
      services: [],
      tasks: [],
      tests: [],
    },
  }

  return {
    ...containerModule,
    buildPath: join(module.buildPath, "build", module.name),
    _ConfigType: {
      ...containerModule,
      serviceConfigs: [],
      taskConfigs: [],
      testConfigs: [],
    },
    serviceConfigs: [],
    taskConfigs: [],
    testConfigs: [],
  }
}

export async function configureModule({
  ctx,
  log,
  moduleConfig,
}: ConfigureModuleParams<OpenFaasModule>): Promise<ConfigureModuleResult> {
  moduleConfig.build.dependencies.push({
    name: "templates",
    plugin: ctx.provider.name,
    copy: [
      {
        source: "template",
        target: ".",
      },
    ],
  })

  const dependencies = [`${ctx.provider.name}--system`]

  moduleConfig.serviceConfigs = [
    {
      dependencies,
      disabled: moduleConfig.disabled,
      hotReloadable: false,
      name: moduleConfig.name,
      spec: {
        name: moduleConfig.name,
        dependencies,
        disabled: moduleConfig.disabled,
      },
    },
  ]

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: union(t.dependencies, dependencies),
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.outputs = {
    endpoint: await getInternalServiceUrl(<OpenFaasPluginContext>ctx, log, moduleConfig),
  }

  return { moduleConfig }
}

async function getInternalGatewayUrl(ctx: PluginContext<OpenFaasConfig>, log: LogEntry) {
  const k8sProvider = getK8sProvider(ctx.provider.dependencies)
  const namespace = await getNamespace({
    log,
    projectName: ctx.projectName,
    provider: k8sProvider,
    skipCreate: true,
  })
  return `http://gateway.${namespace}.svc.cluster.local:8080`
}

async function getInternalServiceUrl(ctx: PluginContext<OpenFaasConfig>, log: LogEntry, config: OpenFaasModuleConfig) {
  return urlResolve(await getInternalGatewayUrl(ctx, log), getServicePath(config))
}

export function getServicePath(config: OpenFaasModuleConfig) {
  return join("/", "function", config.name)
}

export function getExternalGatewayUrl(ctx: PluginContext<OpenFaasConfig>) {
  return ctx.provider.config.gatewayUrl || `http://${ctx.provider.config.hostname}`
}
