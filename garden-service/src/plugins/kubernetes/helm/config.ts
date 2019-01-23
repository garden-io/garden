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
import { Primitive, joiPrimitive, joiArray, joiIdentifier, joiEnvVars, validateWithPath } from "../../../config/common"
import { Module } from "../../../types/module"
import { ValidateModuleParams } from "../../../types/plugin/params"
import { ValidateModuleResult } from "../../../types/plugin/outputs"
import { containsSource } from "./common"
import { ConfigurationError } from "../../../exceptions"
import { deline } from "../../../util/string"
import { HotReloadableKind, hotReloadableKinds } from "../hot-reload"
import { BaseTestSpec, baseTestSpecSchema } from "../../../config/test"
import { BaseTaskSpec } from "../../../config/task"
import { Service } from "../../../types/service"
import { ContainerModule } from "../../container/config"

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
  chart?: string
  chartPath: string
  dependencies: string[]
  repo?: string
  serviceResource?: HelmResourceSpec,
  tasks: HelmTaskSpec[],
  tests: HelmTestSpec[],
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
  chart: Joi.string()
    .description("A valid Helm chart name or URI. Required if the module doesn't contain the Helm chart itself.")
    .example("stable/nginx-ingress"),
  chartPath: Joi.string()
    .uri({ relativeOnly: true })
    .description(
      "The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any).",
    )
    .default("."),
  dependencies: joiArray(joiIdentifier())
    .description("List of names of services that should be deployed before this chart."),
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

export async function validateHelmModule({ ctx, moduleConfig }: ValidateModuleParams<HelmModule>)
  : Promise<ValidateModuleResult<HelmModule>> {
  moduleConfig.spec = validateWithPath({
    config: moduleConfig.spec,
    schema: helmModuleSpecSchema,
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

  const { chart, chartPath, version, values, dependencies, serviceResource, tasks, tests } = moduleConfig.spec

  const sourceModuleName = serviceResource ? serviceResource.containerModule : undefined

  moduleConfig.serviceConfigs = [{
    name: moduleConfig.name,
    dependencies,
    outputs: {},
    sourceModuleName,
    spec: { chart, chartPath, version, values, dependencies, tasks, tests },
  }]

  if (!chart && !(await containsSource(moduleConfig))) {
    throw new ConfigurationError(
      `Chart neither specifies a chart name, nor contains chart sources at \`chartPath\`.`,
      { moduleConfig },
    )
  }

  // Make sure container modules specified in test+task service resources are included as build dependencies
  // (This happens automatically for the service source module).
  function checkResource(what: string, resource?: HelmResourceSpec) {
    if (!resource && !serviceResource) {
      throw new ConfigurationError(
        deline`${what} in Helm module '${moduleConfig.name}' does not specify a target resource,
        and the module does not specify a \`serviceResource\` (which would be used by default).
        Please configure either of those for the configuration to be valid.`,
        { moduleConfig },
      )
    }

    if (
      resource
      && resource.containerModule
      && !find(moduleConfig.build.dependencies, ["name", resource.containerModule])
    ) {
      moduleConfig.build.dependencies.push({ name: resource.containerModule, copy: [] })
    }
  }

  moduleConfig.taskConfigs = tasks.map(spec => {
    // Make sure we have a resource to run the task in
    checkResource(`Task '${spec.name}'`, spec.resource)

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      timeout: spec.timeout,
      spec,
    }
  })

  moduleConfig.testConfigs = tests.map(spec => {
    // Make sure we have a resource to run the test suite in
    checkResource(`Test suite '${spec.name}'`, spec.resource)

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      timeout: spec.timeout,
      env: spec.env,
      spec,
    }
  })

  return moduleConfig
}
