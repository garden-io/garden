/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa = require("execa")
import * as Joi from "joi"
import {
  safeLoad,
  safeLoadAll,
} from "js-yaml"
import { set } from "lodash"
import {
  join,
  resolve,
} from "path"
import { PluginContext } from "../../plugin-context"
import {
  joiArray,
  joiIdentifier,
  joiPrimitive,
  Primitive,
  validate,
} from "../../types/common"
import {
  Module,
  ModuleConfig,
} from "../../types/module"
import {
  ModuleActions,
  Provider,
} from "../../types/plugin/plugin"
import {
  BuildModuleParams,
  DeployServiceParams,
  GetModuleBuildStatusParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import {
  BuildResult,
  ParseModuleResult,
} from "../../types/plugin/outputs"
import {
  Service,
  ServiceConfig,
  ServiceSpec,
  ServiceStatus,
} from "../../types/service"
import { dumpYaml } from "../../util/util"
import { KubernetesProvider } from "./kubernetes"
import { getAppNamespace } from "./namespace"
import {
  kubernetesSpecHandlers,
  KubernetesSpecsModule,
  KubernetesSpecsModuleSpec,
  KubernetesSpecsServiceSpec,
} from "./specs-module"
import { GARDEN_SYSTEM_NAMESPACE } from "./system"

export interface HelmServiceSpec extends ServiceSpec {
  chart: string
  repo?: string
  dependencies: string[]
  version?: string
  parameters: { [key: string]: Primitive }
}

export type HelmModuleSpec = HelmServiceSpec

export class HelmModule extends Module<HelmModuleSpec, HelmServiceSpec> { }

const parameterValueSchema = Joi.alternatives(
  joiPrimitive(),
  Joi.array().items(Joi.lazy(() => parameterValueSchema)),
  Joi.object().pattern(/.+/, Joi.lazy(() => parameterValueSchema)),
)

const helmModuleSpecSchema = Joi.object().keys({
  // TODO: support placing a helm chart in the module directory
  chart: Joi.string()
    .required()
    .description("A valid Helm chart name or URI."),
  repo: Joi.string()
    .description("The repository URL to fetch the chart from."),
  dependencies: joiArray(joiIdentifier())
    .description("List of names of services that should be deployed before this chart."),
  version: Joi.string()
    .description("The chart version to deploy."),
  parameters: Joi.object()
    .pattern(/.+/, parameterValueSchema)
    .default(() => ({}), "{}")
    .description(
      "Map of parameters to pass to Helm when rendering the templates. May include arrays and nested objects.",
  ),
})

export const helmHandlers: Partial<ModuleActions<HelmModule>> = {
  async parseModule({ moduleConfig }: ParseModuleParams): Promise<ParseModuleResult> {
    moduleConfig.spec = validate(
      moduleConfig.spec,
      helmModuleSpecSchema,
      { context: `helm module ${moduleConfig.name}` },
    )

    const { chart, version, parameters, dependencies } = moduleConfig.spec

    const services: ServiceConfig<HelmServiceSpec>[] = [{
      name: moduleConfig.name,
      dependencies,
      outputs: {},
      spec: { chart, version, parameters, dependencies },
    }]

    // TODO: make sure at least either a chart is specified, or module contains a helm chart
    return {
      module: moduleConfig,
      services,
      tests: [],
    }
  },

  async getModuleBuildStatus({ }: GetModuleBuildStatusParams<HelmModule>) {
    return { ready: false }
  },

  buildModule,

  async getServiceStatus(
    { ctx, env, provider, service, logEntry }: GetServiceStatusParams<HelmModule>,
  ): Promise<ServiceStatus> {
    await buildModule({ ctx, env, provider, module: service.module, logEntry })
    const specsService = await makeSpecsService(ctx, provider, service)

    return kubernetesSpecHandlers.getServiceStatus({
      ctx, env, provider, logEntry,
      module: specsService.module,
      service: specsService,
    })
  },

  async deployService({ ctx, env, provider, service }: DeployServiceParams<HelmModule>): Promise<ServiceStatus> {
    const specsService = await makeSpecsService(ctx, provider, service)
    const runtimeContext = await specsService.prepareRuntimeContext()

    return kubernetesSpecHandlers.deployService({
      ctx, env, provider,
      module: specsService.module,
      service: specsService,
      runtimeContext,
    })
  },
}

async function buildModule({ ctx, provider, module, logEntry }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const buildPath = await module.getBuildPath()
  const config = module.config

  // fetch the chart
  const fetchArgs = ["fetch", "--destination", resolve(buildPath, ".."), "--untar", config.spec.chart]
  if (config.spec.version) {
    fetchArgs.push("--version", config.spec.version)
  }
  if (config.spec.repo) {
    fetchArgs.push("--repo", config.spec.repo)
  }
  logEntry && logEntry.setState("Fetching chart...")
  await helm(provider, ...fetchArgs)

  // create the values.yml file
  logEntry && logEntry.setState("Preparing chart...")
  const values = safeLoad(await helm(provider, "inspect", "values", buildPath)) || {}
  Object.entries(config.spec.parameters).map(([k, v]) => set(values, k, v))

  const valuesPath = getValuesPath(buildPath)
  dumpYaml(valuesPath, values)

  // make sure the template renders okay
  await getSpecs(ctx, provider, module)

  return { fresh: true }
}

export function helm(provider: KubernetesProvider, ...args: string[]) {
  return execa.stdout("helm", [
    "--tiller-namespace", GARDEN_SYSTEM_NAMESPACE,
    "--kube-context", provider.config.context,
    ...args,
  ])
}

function getValuesPath(buildPath: string) {
  return join(buildPath, "garden-values.yml")
}

async function getSpecs(ctx: PluginContext, provider: Provider, module: Module) {
  const buildPath = await module.getBuildPath()
  const valuesPath = getValuesPath(buildPath)

  return safeLoadAll(await helm(provider,
    "template",
    "--name", module.name,
    "--namespace", await getAppNamespace(ctx, provider),
    "--values", valuesPath,
    buildPath,
  ))
}

async function makeSpecsService(
  ctx: PluginContext, provider: Provider, service: Service<HelmModule>,
): Promise<Service<KubernetesSpecsModule>> {
  const specs = await getSpecs(ctx, provider, service.module)
  const spec = { specs }

  const config: ModuleConfig<KubernetesSpecsModuleSpec> = { ...service.module.config, spec }
  const specsService: ServiceConfig<KubernetesSpecsServiceSpec> = { ...service.config, spec }

  const module = new KubernetesSpecsModule(ctx, config, [specsService], [])

  return Service.factory(ctx, module, service.name)
}
