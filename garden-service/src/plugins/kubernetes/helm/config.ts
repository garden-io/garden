/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { find } from "lodash"

import {
  joiPrimitive,
  joiArray,
  joiIdentifier,
  joiUserIdentifier,
  DeepPrimitiveMap,
  joi,
  joiModuleIncludeDirective,
} from "../../../config/common"
import { ArtifactSpec } from "../../../config/validation"
import { Module, FileCopySpec } from "../../../types/module"
import { containsSource, getReleaseName } from "./common"
import { ConfigurationError } from "../../../exceptions"
import { deline, dedent } from "../../../util/string"
import { HotReloadableKind, hotReloadableKinds } from "../hot-reload"
import { BaseTestSpec, baseTestSpecSchema } from "../../../config/test"
import { BaseTaskSpec, baseTaskSpecSchema } from "../../../config/task"
import { Service } from "../../../types/service"
import {
  ContainerModule,
  ContainerEnvVars,
  containerEnvVarsSchema,
  commandExample,
  containerArtifactSchema,
} from "../../container/config"
import { baseBuildSpecSchema } from "../../../config/module"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../../types/plugin/module/configure"

export const defaultHelmTimeout = 300

// A Helm Module always maps to a single Service
export type HelmModuleSpec = HelmServiceSpec

export interface HelmResourceSpec {
  kind: HotReloadableKind
  name?: string
  containerName?: string
  containerModule?: string
  hotReloadCommand?: string[]
  hotReloadArgs?: string[]
}

export interface HelmTaskSpec extends BaseTaskSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  command?: string[]
  env: ContainerEnvVars
  resource: HelmResourceSpec
}

export interface HelmTestSpec extends BaseTestSpec {
  args: string[]
  artifacts: ArtifactSpec[]
  command?: string[]
  env: ContainerEnvVars
  resource: HelmResourceSpec
}

export interface HelmModule extends Module<HelmModuleSpec, HelmServiceSpec, HelmTestSpec, HelmTaskSpec> {}
export type HelmModuleConfig = HelmModule["_ConfigType"]

const resourceSchema = joi.object().keys({
  // TODO: consider allowing a `resource` field, that includes the kind and name (e.g. Deployment/my-deployment).
  // TODO: allow using a Pod directly
  kind: joi
    .string()
    .valid(...hotReloadableKinds)
    .default("Deployment")
    .description("The type of Kubernetes resource to sync files to."),
  name: joi.string().description(
    deline`The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
        this can be omitted.

        This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
        This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
        directly from the template in question in order to match it. Note that you may need to add single quotes around
        the string for the YAML to be parsed correctly.`
  ),
  containerName: joi.string().description(
    deline`The name of a container in the target. Specify this if the target contains more than one container
        and the main container is not the first container in the spec.`
  ),
  containerModule: joiIdentifier()
    .description(
      deline`The Garden module that contains the sources for the container. This needs to be specified under
        \`serviceResource\` in order to enable hot-reloading for the chart, but is not necessary for tasks and tests.

        Must be a \`container\` module, and for hot-reloading to work you must specify the \`hotReload\` field
        on the container module.

        Note: If you specify a module here, you don't need to specify it additionally under \`build.dependencies\``
    )
    .example("my-container-module"),
  hotReloadArgs: joi
    .array()
    .items(joi.string())
    .description("If specified, overrides the arguments for the main container when running in hot-reload mode.")
    .example(["nodemon", "my-server.js"]),
})

export const taskSchema = baseTaskSpecSchema.keys({
  resource: resourceSchema.description(
    deline`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.`
  ),
  command: joi
    .array()
    .items(joi.string())
    .description("The command/entrypoint used to run the task inside the container.")
    .example(commandExample),
  args: joi
    .array()
    .items(joi.string())
    .description("The arguments to pass to the pod used for execution.")
    .example(["rake", "db:migrate"]),
  env: containerEnvVarsSchema,
  artifacts: joiArray(containerArtifactSchema).description(
    "Specify artifacts to copy out of the container after the task is complete."
  ),
})

export const testSchema = baseTestSpecSchema.keys({
  resource: resourceSchema.description(
    deline`The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite.
        If not specified, the \`serviceResource\` configured on the module will be used. If neither is specified,
        an error will be thrown.`
  ),
  command: joi
    .array()
    .items(joi.string())
    .description("The command/entrypoint used to run the test inside the container.")
    .example(commandExample),
  args: joi
    .array()
    .items(joi.string())
    .description("The arguments to pass to the pod used for testing.")
    .example(["npm", "test"]),
  env: containerEnvVarsSchema,
  artifacts: joiArray(containerArtifactSchema).description(
    "Specify artifacts to copy out of the container after the test is complete."
  ),
})

export interface HelmServiceSpec {
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
  timeout: number
  version?: string
  values: DeepPrimitiveMap
  valueFiles: string[]
}

export type HelmService = Service<HelmModule, ContainerModule>

const parameterValueSchema = joi
  .alternatives(
    joiPrimitive(),
    joi.array().items(joi.link("#parameterValue")),
    joi.object().pattern(/.+/, joi.link("#parameterValue"))
  )
  .id("parameterValue")

export const helmModuleOutputsSchema = joi.object().keys({
  "release-name": joi
    .string()
    .required()
    .description("The Helm release name of the service."),
})

export const helmModuleSpecSchema = joi.object().keys({
  base: joiUserIdentifier()
    .description(
      deline`The name of another \`helm\` module to use as a base for this one. Use this to re-use a Helm chart across
      multiple services. For example, you might have an organization-wide base chart for certain types of services.

      If set, this module will by default inherit the following properties from the base module:
      \`serviceResource\`, \`values\`

      Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).`
    )
    .example("my-base-chart"),
  build: baseBuildSpecSchema,
  chart: joi
    .string()
    .description(
      deline`A valid Helm chart name or URI (same as you'd input to \`helm install\`).
      Required if the module doesn't contain the Helm chart itself.`
    )
    .example("stable/nginx-ingress"),
  chartPath: joi
    .posixPath()
    .subPathOnly()
    .description(
      deline`The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any).
      Not used when \`base\` is specified.`
    )
    .default("."),
  dependencies: joiArray(joiIdentifier()).description(
    "List of names of services that should be deployed before this chart."
  ),
  releaseName: joiIdentifier().description(
    "Optionally override the release name used when installing (defaults to the module name)."
  ),
  repo: joi.string().description("The repository URL to fetch the chart from."),
  serviceResource: resourceSchema.description(
    deline`The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module
      (not to be confused with Kubernetes Service resources).
      Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain
      Garden features and commands to work, such as hot-reloading.

      We currently map a Helm chart to a single Garden service, because all the resources in a Helm chart are
      deployed at once.`
  ),
  skipDeploy: joi
    .boolean()
    .default(false)
    .description(
      deline`Set this to true if the chart should only be built, but not deployed as a service.
      Use this, for example, if the chart should only be used as a base for other modules.`
    ),
  include: joiModuleIncludeDirective(dedent`
    If neither \`include\` nor \`exclude\` is set, and the module has local chart sources, Garden
    automatically sets \`include\` to: \`["*", "charts/**/*", "templates/**/*"]\`.

    If neither \`include\` nor \`exclude\` is set and the module specifies a remote chart, Garden
    automatically sets \`ìnclude\` to \`[]\`.
  `),
  tasks: joiArray(taskSchema).description("The task definitions for this module."),
  tests: joiArray(testSchema).description("The test suite definitions for this module."),
  timeout: joi
    .number()
    .integer()
    .default(defaultHelmTimeout)
    .description(
      "Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks)."
    ),
  version: joi.string().description("The chart version to deploy."),
  values: joi
    .object()
    .pattern(/.+/, parameterValueSchema)
    .default(() => ({})).description(deline`
      Map of values to pass to Helm when rendering the templates. May include arrays and nested objects.
      When specified, these take precedence over the values in the \`values.yaml\` file (or the files specified
      in \`valueFiles\`).
    `),
  valueFiles: joiArray(joi.posixPath().subPathOnly()).description(dedent`
      Specify value files to use when rendering the Helm chart. These will take precedence over the \`values.yaml\` file
      bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
      this list will have the highest precedence.

      If you _also_ specify keys under the \`values\` field, those will effectively be added as another file at the end
      of this list, so they will take precedence over other files listed here.

      Note that the paths here should be relative to the _module_ root, and the files should be contained in
      your module directory.
    `),
})

export async function configureHelmModule({
  moduleConfig,
}: ConfigureModuleParams<HelmModule>): Promise<ConfigureModuleResult<HelmModule>> {
  const { base, dependencies, serviceResource, skipDeploy, tasks, tests } = moduleConfig.spec

  const sourceModuleName = serviceResource ? serviceResource.containerModule : undefined

  if (!skipDeploy) {
    moduleConfig.serviceConfigs = [
      {
        name: moduleConfig.name,
        dependencies,
        disabled: moduleConfig.disabled,
        // Note: We can't tell here if the source module supports hot-reloading,
        // so we catch it in the handler if need be.
        hotReloadable: !!sourceModuleName,
        sourceModuleName,
        spec: moduleConfig.spec,
      },
    ]
  }

  const containsSources = await containsSource(moduleConfig)

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
      throw new ConfigurationError(
        deline`
        Helm module '${moduleConfig.name}' both contains sources and specifies a base module.
        Since Helm charts cannot currently be merged, please either remove the sources or
        the \`base\` reference in your module config.
      `,
        { moduleConfig }
      )
    }

    // We copy the chart on build
    addBuildDependency(base, [{ source: "*", target: "." }])
  }

  moduleConfig.taskConfigs = tasks.map((spec) => {
    if (spec.resource && spec.resource.containerModule) {
      addBuildDependency(spec.resource.containerModule)
    }

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      disabled: moduleConfig.disabled,
      timeout: spec.timeout,
      spec,
    }
  })

  moduleConfig.testConfigs = tests.map((spec) => {
    if (spec.resource && spec.resource.containerModule) {
      addBuildDependency(spec.resource.containerModule)
    }

    return {
      name: spec.name,
      dependencies: spec.dependencies,
      disabled: moduleConfig.disabled,
      timeout: spec.timeout,
      spec,
    }
  })

  moduleConfig.outputs = {
    "release-name": getReleaseName(moduleConfig),
  }

  // Automatically set the include if not explicitly set
  if (!(moduleConfig.include || moduleConfig.exclude)) {
    moduleConfig.include = containsSources ? ["*", "charts/**/*", "templates/**/*"] : []
  }

  return { moduleConfig }
}
