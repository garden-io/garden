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
import { join } from "path"
import { PluginContext } from "../../plugin-context"
import {
  joiArray,
  joiIdentifier,
  joiPrimitive,
  Primitive,
  validate,
} from "../../config/common"
import { Module } from "../../types/module"
import {
  ModuleActions,
  Provider,
} from "../../types/plugin/plugin"
import {
  BuildModuleParams,
  DeployServiceParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import {
  BuildResult,
  ParseModuleResult,
} from "../../types/plugin/outputs"
import { Service, ServiceStatus } from "../../types/service"
import { dumpYaml } from "../../util/util"
import { KubernetesProvider } from "./kubernetes"
import { getAppNamespace } from "./namespace"
import { GARDEN_BUILD_VERSION_FILENAME } from "../../constants"
import { writeTreeVersionFile } from "../../vcs/base"
import { ServiceState } from "../../types/service"
import { compareDeployedObjects, waitForObjects, checkObjectStatus } from "./status"
import { getGenericModuleBuildStatus } from "../generic"
import { ServiceSpec, ServiceConfig } from "../../config/service"

export interface KubernetesObject {
  apiVersion: string
  kind: string
  metadata: {
    annotations?: object,
    name: string,
    namespace?: string,
    labels?: object,
  }
  spec?: any
}

export interface HelmServiceSpec extends ServiceSpec {
  chart: string
  repo?: string
  dependencies: string[]
  version?: string
  parameters: { [key: string]: Primitive }
}

export type HelmModuleSpec = HelmServiceSpec

export interface HelmModule extends Module<HelmModuleSpec, HelmServiceSpec> { }

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

const helmStatusCodeMap: { [code: number]: ServiceState } = {
  // see https://github.com/kubernetes/helm/blob/master/_proto/hapi/release/status.proto
  0: "unknown",   // UNKNOWN
  1: "ready",     // DEPLOYED
  2: "missing",   // DELETED
  3: "stopped",   // SUPERSEDED
  4: "unhealthy", // FAILED
  5: "stopped",   // DELETING
  6: "deploying", // PENDING_INSTALL
  7: "deploying", // PENDING_UPGRADE
  8: "deploying", // PENDING_ROLLBACK
}

export const helmHandlers: Partial<ModuleActions<HelmModule>> = {
  async parseModule({ moduleConfig }: ParseModuleParams): Promise<ParseModuleResult> {
    moduleConfig.spec = validate(
      moduleConfig.spec,
      helmModuleSpecSchema,
      { context: `helm module ${moduleConfig.name}` },
    )

    const { chart, version, parameters, dependencies } = moduleConfig.spec

    moduleConfig.serviceConfigs = [{
      name: moduleConfig.name,
      dependencies,
      outputs: {},
      spec: { chart, version, parameters, dependencies },
    }]

    // TODO: make sure at least either a chart is specified, or module contains a helm chart
    return moduleConfig
  },

  getModuleBuildStatus: getGenericModuleBuildStatus,
  buildModule,

  async getServiceStatus(
    { ctx, env, provider, service, module, logEntry }: GetServiceStatusParams<HelmModule>,
  ): Promise<ServiceStatus> {
    // need to build to be able to check the status
    const buildStatus = await getGenericModuleBuildStatus({ ctx, env, provider, module, logEntry })
    if (!buildStatus.ready) {
      await buildModule({ ctx, env, provider, module, logEntry })
    }

    // first check if the installed objects on the cluster match the current code
    const objects = await getChartObjects(ctx, provider, service)
    const matched = await compareDeployedObjects(ctx, provider, objects)

    if (!matched) {
      return { state: "outdated" }
    }

    // then check if the rollout is complete
    const version = module.version
    const context = provider.config.context
    const namespace = await getAppNamespace(ctx, provider)
    const { ready } = await checkObjectStatus(context, namespace, objects)

    // TODO: set state to "unhealthy" if any status is "unhealthy"
    const state = ready ? "ready" : "deploying"

    return { state, version: version.versionString }
  },

  async deployService(
    { ctx, provider, module, service, logEntry }: DeployServiceParams<HelmModule>,
  ): Promise<ServiceStatus> {
    const chartPath = await getChartPath(module)
    const valuesPath = getValuesPath(chartPath)
    const releaseName = getReleaseName(ctx, service)
    const namespace = await getAppNamespace(ctx, provider)

    const releaseStatus = await getReleaseStatus(provider, releaseName)

    if (releaseStatus.state === "missing") {
      await helm(provider,
        "install", chartPath,
        "--name", releaseName,
        "--namespace", namespace,
        "--values", valuesPath,
        "--wait",
      )
    } else {
      await helm(provider,
        "upgrade", releaseName, chartPath,
        "--namespace", namespace,
        "--values", valuesPath,
        "--wait",
      )
    }

    const objects = await getChartObjects(ctx, provider, service)
    await waitForObjects({ ctx, provider, service, objects, logEntry })

    return {}
  },
}

async function buildModule({ ctx, provider, module, logEntry }: BuildModuleParams<HelmModule>): Promise<BuildResult> {
  const buildPath = module.buildPath
  const config = module

  // fetch the chart
  const fetchArgs = [
    "fetch", config.spec.chart,
    "--destination", buildPath,
    "--untar",
  ]
  if (config.spec.version) {
    fetchArgs.push("--version", config.spec.version)
  }
  if (config.spec.repo) {
    fetchArgs.push("--repo", config.spec.repo)
  }
  logEntry && logEntry.setState("Fetching chart...")
  await helm(provider, ...fetchArgs)

  const chartPath = await getChartPath(module)

  // create the values.yml file (merge the configured parameters into the default values)
  logEntry && logEntry.setState("Preparing chart...")
  const values = safeLoad(await helm(provider, "inspect", "values", chartPath)) || {}

  Object.entries(flattenValues(config.spec.parameters))
    .map(([k, v]) => set(values, k, v))

  const valuesPath = getValuesPath(chartPath)
  dumpYaml(valuesPath, values)

  // make sure the template renders okay
  const services = await ctx.getServices(module.serviceNames)
  await getChartObjects(ctx, provider, services[0])

  // keep track of which version has been built
  const buildVersionFilePath = join(buildPath, GARDEN_BUILD_VERSION_FILENAME)
  const version = module.version
  await writeTreeVersionFile(buildVersionFilePath, {
    latestCommit: version.versionString,
    dirtyTimestamp: version.dirtyTimestamp,
  })

  return { fresh: true }
}

export function helm(provider: KubernetesProvider, ...args: string[]) {
  return execa.stdout("helm", [
    "--kube-context", provider.config.context,
    ...args,
  ])
}

async function getChartPath(module: HelmModule) {
  const splitName = module.spec.chart.split("/")
  const chartDir = splitName[splitName.length - 1]
  return join(module.buildPath, chartDir)
}

function getValuesPath(chartPath: string) {
  return join(chartPath, "garden-values.yml")
}

async function getChartObjects(ctx: PluginContext, provider: Provider, service: Service) {
  const chartPath = await getChartPath(service.module)
  const valuesPath = getValuesPath(chartPath)
  const namespace = await getAppNamespace(ctx, provider)
  const releaseName = getReleaseName(ctx, service)

  const objects = <KubernetesObject[]>safeLoadAll(await helm(provider,
    "template",
    "--name", releaseName,
    "--namespace", namespace,
    "--values", valuesPath,
    chartPath,
  ))

  return objects.filter(obj => obj !== null).map((obj) => {
    if (!obj.metadata.annotations) {
      obj.metadata.annotations = {}
    }
    return obj
  })
}

function getReleaseName(ctx: PluginContext, service: Service) {
  return `garden--${ctx.projectName}--${service.name}`
}

async function getReleaseStatus(provider: KubernetesProvider, releaseName: string): Promise<ServiceStatus> {
  try {
    const res = JSON.parse(await helm(provider, "status", releaseName, "--output", "json"))
    const statusCode = res.info.status.code
    return {
      state: helmStatusCodeMap[statusCode],
      detail: res,
    }
  } catch (_) {
    // release doesn't exist
    return { state: "missing" }
  }
}

// adapted from https://gist.github.com/penguinboy/762197
function flattenValues(object, prefix = "") {
  return Object.keys(object).reduce(
    (prev, element) =>
      object[element] && typeof object[element] === "object" && !Array.isArray(object[element])
        ? { ...prev, ...flattenValues(object[element], `${prefix}${element}.`) }
        : { ...prev, ...{ [`${prefix}${element}`]: object[element] } },
    {},
  )
}
