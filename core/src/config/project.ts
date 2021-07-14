/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { apply, merge } from "json-merge-patch"
import { deline, dedent } from "../util/string"
import {
  joiArray,
  joiIdentifier,
  joiVariables,
  Primitive,
  joiRepositoryUrl,
  joiUserIdentifier,
  joi,
  includeGuideLink,
  joiPrimitive,
  DeepPrimitiveMap,
  joiVariablesDescription,
  apiVersionSchema,
  joiSparseArray,
} from "./common"
import { validateWithPath } from "./validation"
import { resolveTemplateStrings } from "../template-string/template-string"
import { ProjectConfigContext, EnvironmentConfigContext } from "./template-contexts/project"
import { findByName, getNames } from "../util/util"
import { ConfigurationError, ParameterError, ValidationError } from "../exceptions"
import { PrimitiveMap } from "./common"
import { cloneDeep, omit, isPlainObject } from "lodash"
import { providerConfigBaseSchema, GenericProviderConfig } from "./provider"
import { DOCS_BASE_URL } from "../constants"
import { defaultDotIgnoreFiles } from "../util/fs"
import { pathExists, readFile } from "fs-extra"
import { resolve, basename, relative } from "path"
import chalk = require("chalk")
import { safeLoad } from "js-yaml"
import { CommandInfo } from "../plugin-context"

export const defaultVarfilePath = "garden.env"
export const defaultEnvVarfilePath = (environmentName: string) => `garden.${environmentName}.env`

// These plugins are always loaded
export const defaultNamespace = "default"
export const fixedPlugins = ["exec", "container", "templated"]

export type EnvironmentNamespacing = "disabled" | "optional" | "required"

export interface ParsedEnvironment {
  environment: string
  namespace?: string
}

export interface EnvironmentConfig {
  name: string
  defaultNamespace: string | null
  providers?: GenericProviderConfig[] // further validated by each plugin
  varfile?: string
  variables: DeepPrimitiveMap
  production?: boolean
}

const varfileDescription = `
The format of the files is determined by the configured file's extension:

* \`.env\` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* \`.yaml\`/\`.yml\` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* \`.json\` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._
`.trim()

export const environmentNameSchema = () =>
  joiUserIdentifier().required().description("The name of the environment.").example("dev")

export const environmentSchema = () =>
  joi.object().keys({
    name: environmentNameSchema(),
    defaultNamespace: joiIdentifier()
      .allow(null)
      .default(defaultNamespace)
      .description(
        dedent`
        Set the default namespace to use. This can be templated to be user-specific, or to use an environment variable (e.g. in CI).

        You can also set this to \`null\`, in order to require an explicit namespace to be set on usage. This may be advisable for shared environments, but you may also be able to achieve the desired result by templating this field, as mentioned above.
        `
      )
      .example("user-${local.username}"),
    production: joi
      .boolean()
      .default(false)
      .description(
        dedent`
      Flag the environment as a production environment.

      Setting this flag to \`true\` will activate the protection on the \`deploy\`, \`test\`, \`task\`, \`build\`,
      and \`dev\` commands. A protected command will ask for a user confirmation every time is run against
      an environment marked as production.
      Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).

      This flag is also passed on to every provider, and may affect how certain providers behave.
      For more details please check the documentation for the providers in use.
      `
      )
      .example(true),
    providers: joiArray(providerConfigBaseSchema()).unique("name").meta({
      deprecated:
        "Please use the top-level `providers` field  instead, and if needed use the `environments` key on the provider configurations to limit them to specific environments.",
    }),
    varfile: joi
      .posixPath()
      .description(
        dedent`
          Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
          _environment-specific_ \`variables\` field.

          ${varfileDescription}

          If you don't set the field and the \`${defaultEnvVarfilePath("<env-name>")}\` file does not exist,
          we simply ignore it. If you do override the default value and the file doesn't exist, an error will be thrown.
        `
      )
      .example("custom.env"),
    variables: joiVariables().description(deline`
          A key/value map of variables that modules can reference when using this environment. These take precedence
          over variables defined in the top-level \`variables\` field, but may also reference the top-level variables in
          template strings.
        `),
  })

export const environmentsSchema = () =>
  joi
    .alternatives(
      joiSparseArray(environmentSchema()).unique("name"),
      // Allow a string as a shorthand for { name: foo }
      joiSparseArray(joiUserIdentifier())
    )
    .description("A list of environments to configure for the project.")

export interface SourceConfig {
  name: string
  repositoryUrl: string
}

export const moduleSourceSchema = () =>
  joi.object().keys({
    name: joiUserIdentifier().required().description("The name of the module.").example("my-external-module"),
    repositoryUrl: joiRepositoryUrl().required(),
  })

export const projectSourceSchema = () =>
  joi.object().keys({
    name: joiUserIdentifier().required().description("The name of the source to import").example("my-external-repo"),
    repositoryUrl: joiRepositoryUrl().required(),
  })

export const projectSourcesSchema = () =>
  joiSparseArray(projectSourceSchema()).unique("name").description("A list of remote sources to import into project.")

export const linkedSourceSchema = () =>
  joi.object().keys({
    name: joiUserIdentifier().description("The name of the linked source."),
    path: joi.string().description("The local directory path of the linked repo clone."),
  })

export const linkedModuleSchema = () =>
  joi.object().keys({
    name: joiUserIdentifier().description("The name of the linked module."),
    path: joi.string().description("The local directory path of the linked repo clone."),
  })

export interface OutputSpec {
  name: string
  value: Primitive
}

export interface ProjectConfig {
  apiVersion: string
  kind: "Project"
  name: string
  path: string
  id?: string
  domain?: string
  configPath?: string
  defaultEnvironment: string
  dotIgnoreFiles: string[]
  environments: EnvironmentConfig[]
  modules?: {
    include?: string[]
    exclude?: string[]
  }
  outputs?: OutputSpec[]
  providers: GenericProviderConfig[]
  sources?: SourceConfig[]
  varfile?: string
  variables: DeepPrimitiveMap
}

export interface ProjectResource extends ProjectConfig {
  kind: "Project"
}

export const defaultEnvironments: EnvironmentConfig[] = [
  {
    name: "local",
    defaultNamespace,
    providers: [
      {
        name: "local-kubernetes",
        environments: [],
      },
    ],
    varfile: defaultEnvVarfilePath("local"),
    variables: {},
  },
]

export const projectNameSchema = () =>
  joiIdentifier().required().description("The name of the project.").example("my-sweet-project")

export const projectRootSchema = () => joi.string().description("The path to the project root.")

const projectModulesSchema = () =>
  joi.object().keys({
    include: joi
      .array()
      .items(joi.posixPath().allowGlobs().subPathOnly())
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.

        Note that you can also _exclude_ path using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.

        Unlike the \`exclude\` field, the paths/globs specified here have _no effect_ on which files and directories Garden watches for changes. Use the \`exclude\` field to affect those, if you have large directories that should not be watched for changes.

        Also note that specifying an empty list here means _no paths_ should be included.`
      )
      .example(["modules/**/*"]),
    exclude: joi
      .array()
      .items(joi.posixPath().allowGlobs().subPathOnly())
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for modules.

        The filters here also affect which files and directories are watched for changes. So if you have a large number of directories in your project that should not be watched, you should specify them here.

        For example, you might want to exclude large vendor directories in your project from being scanned and watched, by setting \`exclude: [node_modules/**/*, vendor/**/*]\`.

        Note that you can also explicitly _include_ files using the \`include\` field. If you also specify the \`include\` field, the paths/patterns specified here are filtered from the files matched by \`include\`.

        The \`include\` field does _not_ affect which files are watched.

        See the [Configuration Files guide](${includeGuideLink}) for details.
      `
      )
      .example(["public/**/*", "tmp/**/*"]),
  })

const projectOutputSchema = () =>
  joi.object().keys({
    name: joi.string().max(255).required().description("The name of the output value.").example("my-output-key"),
    value: joiPrimitive()
      .required()
      .description(
        dedent`
        The value for the output. Must be a primitive (string, number, boolean or null). May also be any valid template
        string.`
      )
      .example("${modules.my-module.outputs.some-output}"),
  })

export const projectDocsSchema = () =>
  joi
    .object()
    .keys({
      apiVersion: apiVersionSchema(),
      kind: joi.string().default("Project").valid("Project").description("Indicate what kind of config this is."),
      path: projectRootSchema().meta({ internal: true }),
      configPath: joi.string().meta({ internal: true }).description("The path to the project config file."),
      name: projectNameSchema(),
      // TODO: Refer to enterprise documentation for more details.
      id: joi.string().meta({ internal: true }).description("The project's ID in Garden Enterprise."),
      // TODO: Refer to enterprise documentation for more details.
      domain: joi
        .string()
        .uri()
        .meta({ internal: true })
        .description("The domain to use for cloud features. Should be the full API/backend URL."),
      // Note: We provide a different schema below for actual validation, but need to define it this way for docs
      // because joi.alternatives() isn't handled well in the doc generation.
      environments: joi
        .array()
        .items(environmentSchema())
        .description((<any>environmentsSchema().describe().flags).description),
      providers: joiSparseArray(providerConfigBaseSchema()).description(
        "A list of providers that should be used for this project, and their configuration. " +
          "Please refer to individual plugins/providers for details on how to configure them."
      ),
      defaultEnvironment: joi
        .string()
        .hostname()
        .allow("")
        .default("")
        .description(
          deline`
            The default environment to use when calling commands without the \`--env\` parameter.
            May include a namespace name, in the format \`<namespace>.<environment>\`.
            Defaults to the first configured environment, with no namespace set.
          `
        )
        .example("dev"),
      dotIgnoreFiles: joiSparseArray(joi.posixPath().filenameOnly())
        .default(defaultDotIgnoreFiles)
        .description(
          deline`
        Specify a list of filenames that should be used as ".ignore" files across the project, using the same syntax and semantics as \`.gitignore\` files. By default, patterns matched in \`.gardenignore\` files, found anywhere in the project, are ignored when scanning for modules and module sources (Note: prior to version 0.12.0, \`.gitignore\` files were also used by default).

        Note that these take precedence over the project \`module.include\` field, and module \`include\` fields, so any paths matched by the .ignore files will be ignored even if they are explicitly specified in those fields.

        See the [Configuration Files guide](${DOCS_BASE_URL}/using-garden/configuration-overview#including-excluding-files-and-directories) for details.
      `
        )
        .example([".gardenignore", ".gitignore"]),
      modules: projectModulesSchema().description("Control where to scan for modules in the project."),
      outputs: joiSparseArray(projectOutputSchema())
        .unique("name")
        .description(
          dedent`
        A list of output values that the project should export. These are exported by the \`garden get outputs\` command, as well as when referencing a project as a sub-project within another project.

        You may use any template strings to specify the values, including references to provider outputs, module
        outputs and runtime outputs. For a full reference, see the [Output configuration context](${DOCS_BASE_URL}/reference/template-strings#output-configuration-context) section in the Template String Reference.

        Note that if any runtime outputs are referenced, the referenced services and tasks will be deployed and run if necessary when resolving the outputs.
        `
        ),
      sources: projectSourcesSchema(),
      varfile: joi
        .posixPath()
        .default(defaultVarfilePath)
        .description(
          dedent`
        Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
        project-wide \`variables\` field.

        ${varfileDescription}

        If you don't set the field and the \`garden.env\` file does not exist, we simply ignore it.
        If you do override the default value and the file doesn't exist, an error will be thrown.

        _Note that in many cases it is advisable to only use environment-specific var files, instead of combining
        multiple ones. See the \`environments[].varfile\` field for this option._
      `
        )
        .example("custom.env"),
      variables: joiVariables().description(
        "Key/value map of variables to configure for all environments. " + joiVariablesDescription
      ),
    })
    .required()
    .description(
      "Configuration for a Garden project. This should be specified in the garden.yml file in your project root."
    )

export const projectSchema = () =>
  projectDocsSchema().keys({
    environments: environmentsSchema(),
  })

export function getDefaultEnvironmentName(defaultEnvironment: string, config: ProjectConfig): string {
  // TODO: get rid of the default environment config
  const environments = (config.environments || []).length === 0 ? cloneDeep(defaultEnvironments) : config.environments

  // the default environment is the first specified environment in the config, unless specified
  if (!defaultEnvironment) {
    return environments[0].name
  } else {
    if (!findByName(environments, defaultEnvironment)) {
      throw new ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
        defaultEnvironment,
        availableEnvironments: getNames(environments),
      })
    }
    return defaultEnvironment
  }
}

/**
 * Resolves and validates the given raw project configuration, and returns it in a canonical form.
 *
 * Note: Does _not_ resolve template strings on environments and providers (this needs to happen later in the process).
 *
 * @param config raw project configuration
 */
export function resolveProjectConfig({
  defaultEnvironment,
  config,
  artifactsPath,
  branch,
  username,
  loggedIn,
  enterpriseDomain,
  secrets,
  commandInfo,
}: {
  defaultEnvironment: string
  config: ProjectConfig
  artifactsPath: string
  branch: string
  username: string
  loggedIn: boolean
  enterpriseDomain: string | undefined
  secrets: PrimitiveMap
  commandInfo: CommandInfo
}): ProjectConfig {
  // Resolve template strings for non-environment-specific fields (apart from `sources`).
  const { environments = [], name, sources = [] } = config

  const globalConfig = resolveTemplateStrings(
    {
      apiVersion: config.apiVersion,
      varfile: config.varfile,
      variables: config.variables,
      environments: [],
      sources: [],
    },
    new ProjectConfigContext({
      projectName: name,
      projectRoot: config.path,
      artifactsPath,
      branch,
      username,
      loggedIn,
      enterpriseDomain,
      secrets,
      commandInfo,
    })
  )

  // Validate after resolving global fields
  config = validateWithPath({
    config: {
      ...config,
      ...globalConfig,
      name,
      defaultEnvironment,
      environments: [],
      sources: [],
    },
    schema: projectSchema(),
    configType: "project",
    path: config.path,
    projectRoot: config.path,
  })

  const providers = config.providers

  // TODO: Remove when we deprecate nesting providers under environments
  for (const environment of environments || []) {
    for (const provider of environment.providers || []) {
      providers.push({
        ...provider,
        environments: [environment.name],
      })
    }
    environment.providers = []
  }

  // This will be validated separately, after resolving templates
  config.environments = environments.map((e) => omit(e, ["providers"]))

  config = {
    ...config,
    environments: config.environments || [],
    providers,
    sources,
  }

  config.defaultEnvironment = getDefaultEnvironmentName(defaultEnvironment, config)

  // // TODO: get rid of the default environment config
  if (config.environments.length === 0) {
    config.environments = cloneDeep(defaultEnvironments)
  }

  return config
}

/**
 * Given an environment name, pulls the relevant environment-specific configuration from the specified project
 * config, and merges values appropriately. Also resolves template strings in the picked environment.
 *
 * For project variables, we apply the variables specified to the selected environment on the global variables
 * specified on the top-level `variables` key using a JSON Merge Patch (https://tools.ietf.org/html/rfc7396).
 * We also attempt to load the configured varfiles, and include those in the merge. The precedence order is as follows:
 *   environment.varfile > environment.variables > project.varfile > project.variables
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
 * @param envString the name of the environment to use
 */
export async function pickEnvironment({
  projectConfig,
  envString,
  artifactsPath,
  branch,
  username,
  loggedIn,
  enterpriseDomain,
  secrets,
  commandInfo,
}: {
  projectConfig: ProjectConfig
  envString: string
  artifactsPath: string
  branch: string
  username: string
  loggedIn: boolean
  enterpriseDomain: string | undefined
  secrets: PrimitiveMap
  commandInfo: CommandInfo
}) {
  const { environments, name: projectName, path: projectRoot } = projectConfig

  let { environment, namespace } = parseEnvironment(envString)

  let environmentConfig = findByName(environments, environment)

  if (!environmentConfig) {
    throw new ParameterError(`Project ${projectName} does not specify environment ${environment}`, {
      projectName,
      environmentName: environment,
      namespace,
      definedEnvironments: getNames(environments),
    })
  }

  const projectVarfileVars = await loadVarfile(projectConfig.path, projectConfig.varfile, defaultVarfilePath)
  const projectVariables: DeepPrimitiveMap = <any>merge(projectConfig.variables, projectVarfileVars)

  const envProviders = environmentConfig.providers || []

  // Resolve template strings in the environment config, except providers
  environmentConfig = resolveTemplateStrings(
    { ...environmentConfig, providers: [] },
    new EnvironmentConfigContext({
      projectName,
      projectRoot,
      artifactsPath,
      branch,
      username,
      variables: projectVariables,
      loggedIn,
      enterpriseDomain,
      secrets,
      commandInfo,
    })
  )

  environmentConfig = validateWithPath({
    config: environmentConfig,
    schema: environmentSchema(),
    configType: `environment ${environment}`,
    path: projectConfig.path,
    projectRoot: projectConfig.path,
  })

  namespace = getNamespace(environmentConfig, namespace)

  const fixedProviders = fixedPlugins.map((name) => ({ name }))
  const allProviders = [
    ...fixedProviders,
    ...projectConfig.providers.filter((p) => !p.environments || p.environments.includes(environment)),
    ...envProviders,
  ]

  const mergedProviders: { [name: string]: GenericProviderConfig } = {}

  for (const provider of allProviders) {
    if (!!mergedProviders[provider.name]) {
      // Merge using a JSON Merge Patch (see https://tools.ietf.org/html/rfc7396)
      apply(mergedProviders[provider.name], provider)
    } else {
      mergedProviders[provider.name] = cloneDeep(provider)
    }
  }

  const envVarfileVars = await loadVarfile(
    projectConfig.path,
    environmentConfig.varfile,
    defaultEnvVarfilePath(environment)
  )

  const variables: DeepPrimitiveMap = <any>merge(projectVariables, merge(environmentConfig.variables, envVarfileVars))

  return {
    environmentName: environment,
    namespace,
    production: !!environmentConfig.production,
    providers: Object.values(mergedProviders),
    variables,
  }
}

/**
 * Validates that the value passed for `namespace` conforms with the namespacing setting in `environmentConfig`,
 * and returns `namespace` (or a default namespace, if appropriate).
 */
export function getNamespace(environmentConfig: EnvironmentConfig, namespace: string | undefined): string {
  const envName = environmentConfig.name

  if (!namespace && environmentConfig.defaultNamespace) {
    namespace = environmentConfig.defaultNamespace
  }

  if (!namespace) {
    const envHighlight = chalk.white.bold(envName)
    const exampleFlag = chalk.white(`--env=${chalk.bold("some-namespace.")}${envName}`)

    throw new ParameterError(
      `Environment ${envHighlight} has defaultNamespace set to null, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. ${exampleFlag}).`,
      {
        environmentConfig,
      }
    )
  }

  return namespace
}

export function parseEnvironment(env: string): ParsedEnvironment {
  const result = joi.environment().validate(env, { errors: { label: false } })

  if (result.error) {
    throw new ValidationError(`Invalid environment specified (${env}): ${result.error.message}`, { env })
  }

  // Note: This is validated above to be either one or two parts
  const split = env.split(".")

  if (split.length === 1) {
    return { environment: env }
  } else {
    return { environment: split[1], namespace: split[0] }
  }
}

async function loadVarfile(projectRoot: string, path: string | undefined, defaultPath: string): Promise<PrimitiveMap> {
  const resolvedPath = resolve(projectRoot, path || defaultPath)
  const exists = await pathExists(resolvedPath)

  if (!exists && path && path !== defaultPath) {
    throw new ConfigurationError(`Could not find varfile at path '${path}'`, {
      path,
      resolvedPath,
    })
  }

  if (!exists) {
    return {}
  }

  try {
    const data = await readFile(resolvedPath)
    const relPath = relative(projectRoot, resolvedPath)
    const filename = basename(resolvedPath.toLowerCase())

    if (filename.endsWith(".json")) {
      const parsed = JSON.parse(data.toString())
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError(`Configured variable file ${relPath} must be a valid plain JSON object`, {
          parsed,
        })
      }
      return parsed
    } else if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
      const parsed = safeLoad(data.toString())
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError(`Configured variable file ${relPath} must be a single plain YAML mapping`, {
          parsed,
        })
      }
      return parsed as PrimitiveMap
    } else {
      // Note: For backwards-compatibility we fall back on using .env as a default format, and don't specifically
      // validate the extension for that.
      return dotenv.parse(await readFile(resolvedPath))
    }
  } catch (error) {
    throw new ConfigurationError(`Unable to load varfile at '${path}': ${error}`, {
      error,
      path,
    })
  }
}
