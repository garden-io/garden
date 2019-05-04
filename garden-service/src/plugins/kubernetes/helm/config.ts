/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("joi")
import { find } from "lodash"

import { ServiceSpec } from "../../../config/service"
import {
  Primitive,
  joiPrimitive,
  joiArray,
  joiIdentifier,
  joiEnvVars,
  joiUserIdentifier,
} from "../../../config/common"
import { Module, FileCopySpec } from "../../../types/module"
import { ConfigureModuleParams } from "../../../types/plugin/params"
import { ConfigureModuleResult } from "../../../types/plugin/outputs"
import { containsSource, getReleaseName } from "./common"
import { ConfigurationError } from "../../../exceptions"
import { deline } from "../../../util/string"
import { HotReloadableKind, hotReloadableKinds } from "../hot-reload"
import { BaseTestSpec, baseTestSpecSchema } from "../../../config/test"
import { BaseTaskSpec } from "../../../config/task"
import { Service } from "../../../types/service"
import { ContainerModule } from "../../container/config"
import { baseBuildSpecSchema } from "../../../config/module"

// A Helm Module always maps to a single Service
export type HelmModuleSpec = HelmServiceSpec

export interface HelmResourceSpec {
  kind: HotReloadableKind,
  name?: string,
  containerName?: string,
  containerModule?: string
  hotReloadArgs?: string[],
}

export interface HelmTaskSpec extends BaseTaskSpec {
  resource: HelmResourceSpec
  args: string[]
  env: { [key: string]: string }
}

export interface HelmTestSpec extends BaseTestSpec {
  resource: HelmResourceSpec
  args: string[]
  env: { [key: string]: string }
}

export interface HelmModule extends Module<HelmModuleSpec, HelmServiceSpec, HelmTestSpec, HelmTaskSpec> { }
export type HelmModuleConfig = HelmModule["_ConfigType"]

const resourceSchema = Joi.object()
  .keys({
    // TODO: consider allowing a `resource` field, that includes the kind and name (e.g. Deployment/my-deployment).
    // TODO: allow using a Pod directly
    kind: Joi.string()
      .only(...hotReloadableKinds)
      .default("Deployment")
      .description("The type of Kubernetes resource to sync files to."),
    name: Joi.string()
      .description(
        deline`The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
        this can be omitted.

        This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
        This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
        directly from the template in question in order to match it. Note that you may need to add single quotes around
        the string for the YAML to be parsed correctly.`,
      ),
    containerName: Joi.string()
      .description(
        deline`The name of a container in the target. Specify this if the target contains more than one container
        and the main container is not the first container in the spec.`,
      ),
    containerModule: joiIdentifier()
      .description(
        deline`The Garden module that contains the sources for the container. This needs to be specified under
        \`serviceResource\` in order to enable hot-reloading for the chart, but is not necessary for tasks and tests.

        Must be a \`container\` module, and for hot-reloading to work you must specify the \`hotReload\` field
        on the container module.

        Note: If you specify a module here, you don't need to specify it additionally under \`build.dependencies\``,
      )
      .example("my-container-module"),
    hotReloadArgs: Joi.array().items(Joi.string())
      .description(
        "If specified, overrides the arguments for the main container when running in hot-reload mode.",
      )
      .example([["nodemon", "my-server.js"], {}]),
  })

export const execTaskSchema = baseTestSpecSchema
  .keys({
    resource: resourceSchema
      .description(
        deline`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.`,
      ),
    args: Joi.array().items(Joi.string())
      .description("The arguments to pass to the pod used for execution."),
    env: joiEnvVars(),
  })

export const execTestSchema = baseTestSpecSchema
  .keys({
    resource: resourceSchema
      .description(
        deline`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.`,
      ),
    args: Joi.array().items(Joi.string())
      .description("The arguments to pass to the pod used for testing."),
    env: joiEnvVars(),
  })

export interface HelmServiceSpec extends ServiceSpec {
  base?: string
  chart?: string
  chartPath: string
  dependencies: string[]
  releaseName?: string
  repo?: string
  serviceResource?: HelmResourceSpec
  skipDeploy: boolean
  tasks: HelmTaskSpec[]
  tests: HelmTestSpec[]
  version?: string
  values: { [key: string]: Primitive }
}

export type HelmService = Service<HelmModule, ContainerModule>

const parameterValueSchema = Joi.alternatives(
  joiPrimitive(),
  Joi.array().items(Joi.lazy(() => parameterValueSchema)),
  Joi.object().pattern(/.+/, Joi.lazy(() => parameterValueSchema)),
)

export const helmModuleSpecSchema = Joi.object().keys({
  base: joiUserIdentifier()
    .description(
      deline`The name of another \`helm\` module to use as a base for this one. Use this to re-use a Helm chart across
      multiple services. For example, you might have an organization-wide base chart for certain types of services.

      If set, this module will by default inherit the following properties from the base module:
      \`serviceResource\`, \`values\`

      Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).`,
    )
    .example("my-base-chart"),
  build: baseBuildSpecSchema,
  chart: Joi.string()
    .description(
      deline`A valid Helm chart name or URI (same as you'd input to \`helm install\`).
      Required if the module doesn't contain the Helm chart itself.`,
    )
    .example("stable/nginx-ingress"),
  chartPath: Joi.string()
    .uri({ relativeOnly: true })
    .description(
      deline`The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any).
      Not used when \`base\` is specified.`,
    )
    .default("."),
  dependencies: joiArray(joiIdentifier())
    .description("List of names of services that should be deployed before this chart."),
  releaseName: joiIdentifier()
    .description("Optionally override the release name used when installing (defaults to the module name)."),
  repo: Joi.string()
    .description("The repository URL to fetch the chart from."),
  serviceResource: resourceSchema
    .description(
      deline`The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module
      (not to be confused with Kubernetes Service resources).
      Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain
      Garden features and commands to work, such as hot-reloading.

      We currently map a Helm chart to a single Garden service, because all the resources in a Helm chart are
      deployed at once.`,
    ),
  skipDeploy: Joi.boolean()
    .default(false)
    .description(
      deline`Set this to true if the chart should only be built, but not deployed as a service.
      Use this, for example, if the chart should only be used as a base for other modules.`,
    ),
  tasks: joiArray(execTaskSchema)
    .description("The task definitions for this module."),
  tests: joiArray(execTestSchema)
    .description("The test suite definitions for this module."),
  version: Joi.string()
    .description("The chart version to deploy."),
  values: Joi.object()
    .pattern(/.+/, parameterValueSchema)
    .default(() => ({}), "{}")
    .description(
      "Map of values to pass to Helm when rendering the templates. May include arrays and nested objects.",
    ),
})

export async function validateHelmModule({ moduleConfig }: ConfigureModuleParams<HelmModule>)
  : Promise<ConfigureModuleResult<HelmModule>> {
  const {
    base, chart, dependencies, serviceResource, skipDeploy, tasks, tests,
  } = moduleConfig.spec

  const sourceModuleName = serviceResource ? serviceResource.containerModule : undefined

  if (!skipDeploy) {
    moduleConfig.serviceConfigs = [{
      name: moduleConfig.name,
      dependencies,
      outputs: {},
      // Note: We can't tell here if the source module supports hot-reloading, so we catch it in the handler if need be.
      hotReloadable: !!sourceModuleName,
      sourceModuleName,
      spec: moduleConfig.spec,
    }]
  }

  const containsSources = await containsSource(moduleConfig)

  if (!chart && !base && !containsSources) {
    throw new ConfigurationError(
      `Chart neither specifies a chart name, base module, nor contains chart sources at \`chartPath\`.`,
      { moduleConfig },
    )
  }

  // Make sure referenced modules are included as build dependencies
  // (This happens automatically for the service source module).
  function addBuildDependency(name: string, copy?: FileCopySpec[]) {
    const existing = find(moduleConfig.build.dependencies, ["name", name])
    if (!copy) {
      copy = []
    }
    if (existing) {
      existing.copy.push(...copy)
    } else {
      moduleConfig.build.dependencies.push({ name, copy })
    }
  }

  if (base) {
    if (containsSources) {
      throw new ConfigurationError(deline`
        Helm module '${moduleConfig.name}' both contains sources and specifies a base module.
        Since Helm charts cannot currently be merged, please either remove the sources or
        the \`base\` reference in your module config.
      `, { moduleConfig })
    }

    // We copy the chart on build
    addBuildDependency(base, [{ source: "*", target: "." }])
  }

  moduleConfig.taskConfigs = tasks.map(spec => {
    if (spec.resource && spec.resource.containerModule) {
      addBuildDependency(spec.resource.containerModule)
    }

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      timeout: spec.timeout,
      spec,
    }
  })

  moduleConfig.testConfigs = tests.map(spec => {
    if (spec.resource && spec.resource.containerModule) {
      addBuildDependency(spec.resource.containerModule)
    }

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      timeout: spec.timeout,
      env: spec.env,
      spec,
    }
  })

  moduleConfig.outputs = {
    "release-name": await getReleaseName(moduleConfig),
  }

  return moduleConfig
}
