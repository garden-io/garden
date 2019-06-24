/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { apply, merge } from "json-merge-patch"
import { deline } from "../util/string"
import {
  joiArray,
  joiIdentifier,
  joiVariables,
  Primitive,
  joiRepositoryUrl,
  joiUserIdentifier,
  validateWithPath,
  joi,
} from "./common"
import { resolveTemplateStrings } from "../template-string"
import { ProjectConfigContext } from "./config-context"
import { findByName, getNames } from "../util/util"
import { ConfigurationError, ParameterError } from "../exceptions"
import { PrimitiveMap } from "./common"
import { fixedPlugins } from "../plugins/plugins"
import { cloneDeep, omit } from "lodash"
import { providerConfigBaseSchema, Provider, ProviderConfig } from "./provider"
import { DEFAULT_API_VERSION } from "../constants"

export interface CommonEnvironmentConfig {
  providers?: ProviderConfig[]  // further validated by each plugin
  variables: { [key: string]: Primitive }
}

export const environmentConfigSchema = joi.object()
  .keys({
    providers: joiArray(providerConfigBaseSchema)
      .unique("name")
      .meta({ deprecated: true })
      .description(deline`
        DEPRECATED - Please use the top-level \`providers\` field instead, and if needed use the \`environments\` key
        on the provider configurations to limit them to specific environments.
      `),
    variables: joiVariables()
      .description(deline`
        A key/value map of variables that modules can reference when using this environment. These take precedence
        over variables defined in the top-level \`variables\` field.
      `),
  })

export interface EnvironmentConfig extends CommonEnvironmentConfig {
  name: string
}

export interface Environment extends EnvironmentConfig {
  providers: Provider[]
}

export const environmentNameSchema = joiUserIdentifier()
  .required()
  .description("The name of the environment.")

const environmentSchema = environmentConfigSchema
  .keys({
    name: environmentNameSchema,
  })

const environmentsSchema = joi.alternatives(
  joi.array().items(environmentSchema).unique("name"),
  // Allow a string as a shorthand for { name: foo }
  joi.array().items(joiUserIdentifier()),
)

export interface SourceConfig {
  name: string
  repositoryUrl: string
}

export const projectSourceSchema = joi.object()
  .keys({
    name: joiUserIdentifier()
      .required()
      .description("The name of the source to import"),
    repositoryUrl: joiRepositoryUrl()
      .required(),
  })

export const projectSourcesSchema = joiArray(projectSourceSchema)
  .unique("name")
  .description("A list of remote sources to import into project.")

export interface ProjectConfig {
  apiVersion: string
  kind: "Project",
  name: string
  path: string
  defaultEnvironment: string
  environmentDefaults?: CommonEnvironmentConfig
  environments: EnvironmentConfig[]
  providers: ProviderConfig[]
  sources?: SourceConfig[]
  variables: PrimitiveMap
}

export interface ProjectResource extends ProjectConfig {
  kind: "Project"
}

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    name: "local",
    providers: [
      {
        name: "local-kubernetes",
        environments: [],
      },
    ],
    variables: {},
  },
]

const emptyEnvironmentDefaults = {
  providers: [],
  variables: {},
}

export const projectNameSchema = joiIdentifier()
  .required()
  .description("The name of the project.")
  .example("my-sweet-project")

export const projectSchema = joi.object()
  .keys({
    apiVersion: joi.string()
      .default(DEFAULT_API_VERSION)
      .only(DEFAULT_API_VERSION)
      .description("The schema version of this project's config (currently not used)."),
    kind: joi.string().default("Project").only("Project"),
    path: joi.string().meta({ internal: true }),
    name: projectNameSchema,
    defaultEnvironment: joi.string()
      .allow("")
      .default("", "<first specified environment>")
      .description("The default environment to use when calling commands without the `--env` parameter."),
    environmentDefaults: environmentConfigSchema
      .default(() => emptyEnvironmentDefaults, safeDump(emptyEnvironmentDefaults))
      .example([emptyEnvironmentDefaults, {}])
      .meta({ deprecated: true })
      .description(deline`
        DEPRECATED - Please use the \`providers\` field instead, and omit the environments key in the configured
        provider to use it for all environments, and use the \`variables\` field to configure variables across all
        environments.
      `),
    environments: environmentsSchema
      .description("A list of environments to configure for the project.")
      .example([defaultEnvironments, {}]),
    providers: joiArray(providerConfigBaseSchema)
      .description(
        "A list of providers that should be used for this project, and their configuration. " +
        "Please refer to individual plugins/providers for details on how to configure them.",
      ),
    sources: projectSourcesSchema,
    variables: joiVariables()
      .description("Variables to configure for all environments."),
  })
  .required()
  .description(
    "Configuration for a Garden project. This should be specified in the garden.yml file in your project root.",
  )

/**
 * Resolves and validates the given raw project configuration, and returns it in a canonical form.
 *
 * Note: Does _not_ resolve template strings on providers (this needs to happen later in the process).
 *
 * @param config raw project configuration
 */
export async function resolveProjectConfig(config: ProjectConfig): Promise<ProjectConfig> {
  // Resolve template strings for non-environment-specific fields
  let { environmentDefaults, environments = [] } = config

  const globalConfig = await resolveTemplateStrings(
    {
      apiVersion: config.apiVersion,
      defaultEnvironment: config.defaultEnvironment,
      environmentDefaults: { variables: {}, ...environmentDefaults || {}, providers: <ProviderConfig[]>[] },
      name: config.name,
      sources: config.sources,
      variables: config.variables,
      environments: environments.map(e => omit(e, ["providers"])),
    },
    new ProjectConfigContext(),
  )

  // Validate after resolving global fields
  config = validateWithPath({
    config: { ...config, ...globalConfig },
    schema: projectSchema,
    configType: "project",
    path: config.path,
    projectRoot: config.path,
  })

  // Convert deprecated fields
  if (!environmentDefaults) {
    environmentDefaults = config.environmentDefaults
  }

  const { defaultEnvironment } = config

  // Note: The ordering here is important
  const providers = [
    ...environmentDefaults!.providers || [],
    ...config.providers,
  ]

  for (const environment of environments || []) {
    for (const provider of environment.providers || []) {
      providers.push({
        ...provider,
        environments: [environment.name],
      })
    }
    environment.providers = []
  }

  const variables = { ...config.environmentDefaults!.variables, ...config.variables }

  config = {
    ...config,
    environmentDefaults: {
      providers: [],
      variables: {},
    },
    environments: config.environments || [],
    providers,
    variables,
  }

  // TODO: get rid of the default environment config
  if (config.environments.length === 0) {
    config.environments = cloneDeep(defaultEnvironments)
  }

  // the default environment is the first specified environment in the config, unless specified
  if (defaultEnvironment === "") {
    config.defaultEnvironment = config.environments[0].name
  } else {
    if (!findByName(config.environments, defaultEnvironment)) {
      throw new ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
        defaultEnvironment,
        availableEnvironments: getNames(config.environments),
      })
    }
  }

  return config
}

/**
 * Given an environment name, pulls the relevant environment-specific configuration from the specified project
 * config, and merges values appropriately.
 *
 * For project variables, we apply the variables specified to the selected environment on the global variables
 * specified on the top-level `variables` key using a JSON Merge Patch (https://tools.ietf.org/html/rfc7396).
 *
 * For provider configuration, we filter down to the providers that are enabled for all environments (no `environments`
 * key specified) and those that explicitly list the specified environments. Then we merge any provider configs with
 * the same provider name, again using JSON Merge Patching, with later entries in the list taking precedence over
 * prior ones.
 *
 * Because we use JSON Merge Patch, be aware that specifying a _null_ value means that it will be omitted in the
 * resulting config.
 *
 * Note: This assumes that deprecated fields have been converted, e.g. by the resolveProjectConfig() function.
 *
 * @param config a resolved project config (as returned by `resolveProjectConfig()`)
 * @param environmentName the name of the environment to use
 */
export function pickEnvironment(config: ProjectConfig, environmentName: string) {
  const { environments, name: projectName } = config

  const environmentConfig = findByName(environments, environmentName)

  if (!environmentConfig) {
    throw new ParameterError(`Project ${projectName} does not specify environment ${environmentName}`, {
      projectName,
      environmentName,
      definedEnvironments: getNames(environments),
    })
  }

  const fixedProviders = fixedPlugins.map(name => ({ name }))
  const allProviders = [
    ...fixedProviders,
    ...config.providers.filter(p => !p.environments || p.environments.includes(environmentName)),
  ]

  const mergedProviders: { [name: string]: ProviderConfig } = {}

  for (const provider of allProviders) {
    if (!!mergedProviders[provider.name]) {
      // Merge using a JSON Merge Patch (see https://tools.ietf.org/html/rfc7396)
      apply(mergedProviders[provider.name], provider)
    } else {
      mergedProviders[provider.name] = cloneDeep(provider)
    }
  }

  const variables: PrimitiveMap = <any>merge(config.variables, environmentConfig.variables)

  return {
    providers: Object.values(mergedProviders),
    variables,
  }
}
