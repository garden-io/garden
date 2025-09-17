/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent, deline, naturalList } from "../util/string.js"
import type { DeepPrimitiveMap, Primitive, PrimitiveMap, StringMap } from "./common.js"
import {
  createSchema,
  includeGuideLink,
  joi,
  joiIdentifier,
  joiPrimitive,
  joiRepositoryUrl,
  joiSparseArray,
  joiUserIdentifier,
  joiVariables,
  joiVariablesDescription,
} from "./common.js"
import type { ConfigSource } from "./validation.js"
import { validateConfig, validateWithPath } from "./validation.js"
import { deepEvaluate, evaluate } from "../template/evaluate.js"
import type { ProjectConfigContext } from "./template-contexts/project.js"
import { EnvironmentConfigContext } from "./template-contexts/project.js"
import { findByName, getNames } from "../util/util.js"
import { ConfigurationError, InternalError, ParameterError, ValidationError } from "../exceptions.js"
import { memoize } from "lodash-es"
import { providerConfigBaseSchema } from "./provider.js"
import type { GitScanMode } from "../constants.js"
import { supportedApiVersions } from "../constants.js"
import { DOCS_BASE_URL, GardenApiVersion, defaultGitScanMode, gitScanModes } from "../constants.js"
import { defaultDotIgnoreFile } from "../util/fs.js"
import type { CommandInfo } from "../plugin-context.js"
import type { VcsInfo } from "../vcs/vcs.js"
import { profileAsync } from "../util/profiling.js"
import type { BaseGardenResource } from "./base.js"
import { baseInternalFieldsSchema, varfileDescription } from "./base.js"
import type { Log } from "../logger/log-entry.js"
import { renderDivider } from "../logger/util.js"
import { styles } from "../logger/styles.js"
import { serialiseUnresolvedTemplates, type ParsedTemplate } from "../template/types.js"
import { deepResolveContext } from "./template-contexts/base.js"
import { LazyMergePatch } from "../template/lazy-merge.js"
import { isArray, isPlainObject } from "../util/objects.js"
import { VariablesContext } from "./template-contexts/variables.js"
import { getBackendType } from "../cloud/util.js"
import type { EnvironmentAecConfig } from "./aec.js"
import { aecConfigSchema } from "./aec.js"

export const defaultProjectVarfilePath = "garden.env"
export const defaultEnvVarfilePath = (environmentName: string) => `garden.${environmentName}.env`

export const defaultEnvironment = "default"
export const defaultNamespace = "default"
// These plugins are always loaded
export const fixedPlugins = ["exec", "container", "templated"]

export interface ParsedEnvironment {
  environment: string
  namespace?: string
}

export interface EnvironmentConfig {
  name: string
  defaultNamespace: string | null
  varfile?: string
  variables: DeepPrimitiveMap
  production?: boolean
  aec?: EnvironmentAecConfig
}

export const environmentNameSchema = memoize(() =>
  joiUserIdentifier().required().description("The name of the environment.").example("dev")
)

export const environmentSchema = createSchema({
  name: "project-environment",
  keys: () => ({
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

      Setting this flag to \`true\` will activate the protection on the \`build\`, \`delete\`, \`deploy\`, \`dev\`, and
      \`test\` commands. A protected command will ask for a user confirmation every time is run against
      an environment marked as production.
      Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).

      This flag is also passed on to every provider, and may affect how certain providers behave.
      For more details please check the documentation for the providers in use.
      `
      )
      .example(true),
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
          A key/value map of variables that actions can reference when using this environment. These take precedence
          over variables defined in the top-level \`variables\` field, but may also reference the top-level variables in
          template strings.
        `),
    aec: aecConfigSchema(),
  }),
})

export const environmentsSchema = memoize(() =>
  joiSparseArray(environmentSchema()).unique("name").description("A list of environments to configure for the project.")
)

export interface SourceConfig {
  name: string
  repositoryUrl: string
}

export const actionSourceSchema = createSchema({
  name: "action-source",
  keys: () => ({
    name: joi.string().hostname().required().description("The name of the action.").example("build.my-external-build"),
    repositoryUrl: joiRepositoryUrl().required(),
  }),
})

export const moduleSourceSchema = createSchema({
  name: "module-source",
  keys: () => ({
    name: joiUserIdentifier().required().description("The name of the module.").example("my-external-module"),
    repositoryUrl: joiRepositoryUrl().required(),
  }),
})

export const projectSourceSchema = createSchema({
  name: "project-source",
  keys: () => ({
    name: joiUserIdentifier().required().description("The name of the source to import").example("my-external-repo"),
    repositoryUrl: joiRepositoryUrl().required(),
  }),
})

export const projectSourcesSchema = memoize(() =>
  joiSparseArray(projectSourceSchema()).unique("name").description("A list of remote sources to import into project.")
)

export const linkedSourceSchema = createSchema({
  name: "linked-source",
  keys: () => ({
    name: joiUserIdentifier().description("The name of the linked source."),
    path: joi.string().description("The local directory path of the linked repo clone."),
  }),
})

export const linkedActionSchema = createSchema({
  name: "linked-action",
  keys: () => ({
    name: joi.string().hostname().description("The key of the linked action."),
    path: joi.string().description("The local directory path of the linked repo clone."),
  }),
})

export const linkedModuleSchema = createSchema({
  name: "linked-module",
  keys: () => ({
    name: joiUserIdentifier().description("The name of the linked module."),
    path: joi.string().description("The local directory path of the linked repo clone."),
  }),
})

export interface OutputSpec {
  name: string
  value: Primitive
}

export interface ProxyConfig {
  hostname: string
}

interface GitConfig {
  mode: GitScanMode
}

interface ProjectScan {
  include?: string[]
  exclude?: string[]
  git?: GitConfig
}

interface ImportVarsSourceGardenCloud {
  source: "garden-cloud"
  varlist: string
}
/**
 * We support short-hand configuration for remote variables which treats the source as Garden Cloud. Specifically:
 *
 *  - a string value is treated as a single Garden Cloud varlist ID
 *  - an array of strings is treated as a list of Garden Cloud varlist IDs
 *  - an array of objects can refer to different remote variable sources that are each handled appropriately
 */
export type ImportVariablesConfig = string | string[] | ImportVarsSourceGardenCloud[] | undefined

export interface ProjectConfig extends BaseGardenResource {
  apiVersion: GardenApiVersion
  kind: "Project"
  name: string
  path: string
  id?: string // TODO: Remove this field once backend v1 has been phased out.
  domain?: string
  organizationId?: string
  configPath?: string
  proxy?: ProxyConfig
  defaultEnvironment: string
  dotIgnoreFile: string
  environments: EnvironmentConfig[]
  excludeValuesFromActionVersions: string[]
  scan?: ProjectScan
  outputs?: OutputSpec[]
  providers: ParsedTemplate[]
  sources?: SourceConfig[]
  varfile?: string
  variables: DeepPrimitiveMap
  importVariables: ImportVariablesConfig
}

export const projectApiVersionSchema = memoize(() =>
  joi.string().valid(...supportedApiVersions).description(dedent`
      The Garden apiVersion for this project.

      The value ${GardenApiVersion.v0} is the default for backwards compatibility with
      Garden Acorn (0.12) when not explicitly specified.

      Configuring ${GardenApiVersion.v1} explicitly in your project configuration allows
      you to start using the new Action configs introduced in Garden Bonsai (0.13).

      Note that the value ${GardenApiVersion.v1} will break compatibility of your project
      with Garden Acorn (0.12).

      EXPERIMENTAL: Configuring ${GardenApiVersion.v2} explicitly in your project configuration
      activates the breaking changes introduced in Garden 0.14.
      The list of breaking changes is not final yet, so use this setting at your own risk.

      Please refer to [the deprecations guide](${DOCS_BASE_URL}/guides/deprecations) for more information.
    `)
)

export const projectNameSchema = memoize(() =>
  joiIdentifier().required().description("The name of the project.").example("my-sweet-project")
)

export const projectRootSchema = memoize(() => joi.string().description("The path to the project root."))

const projectScanSchema = createSchema({
  name: "project-scan",
  keys: () => ({
    include: joi
      .array()
      .items(joi.posixPath().allowGlobs().subPathOnly())
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be scanned for Garden configuration files.

        Note that you can also _exclude_ path using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.

        Unlike the \`exclude\` field, the paths/globs specified here have _no effect_ on which files and directories Garden watches for changes. Use the \`exclude\` field to affect those, if you have large directories that should not be watched for changes.

        Also note that specifying an empty list here means _no paths_ should be included.`
      )
      .example(["actions/**/*"]),
    exclude: joi
      .array()
      .items(joi.posixPath().allowGlobs().subPathOnly())
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for configuration files.

        The filters here also affect which files and directories are watched for changes. So if you have a large number of directories in your project that should not be watched, you should specify them here.

        For example, you might want to exclude large vendor directories in your project from being scanned and watched, by setting \`exclude: [node_modules/**/*, vendor/**/*]\`.

        Note that you can also explicitly _include_ files using the \`include\` field. If you also specify the \`include\` field, the paths/patterns specified here are filtered from the files matched by \`include\`.

        The \`include\` field does _not_ affect which files are watched.

        See the [Configuration Files guide](${includeGuideLink}) for details.
      `
      )
      .example(["public/**/*", "tmp/**/*"]),
    git: joi.object().keys({
      mode: joi
        .string()
        .allow(...gitScanModes)
        .only()
        .default(defaultGitScanMode)
        .description(
          `Choose how to perform scans of git repositories. Defaults to \`${defaultGitScanMode}\`. The \`subtree\` runs individual git scans on each action/module path. The \`repo\` mode scans entire repositories and then filters down to files matching the paths, includes and excludes for each action/module. This can be considerably more efficient for large projects with many actions/modules.`
        ),
    }),
  }),
})

const projectOutputSchema = createSchema({
  name: "project-output",
  keys: () => ({
    name: joi.string().max(255).required().description("The name of the output value.").example("my-output-key"),
    value: joiPrimitive()
      .required()
      .description(
        dedent`
        The value for the output. Must be a primitive (string, number, boolean or null). May also be any valid template
        string.`
      )
      .example("${actions.build.my-build.outputs.deployment-image-name}"),
  }),
})

// The remote variable schema supports one of:
//  - string, treated as a Garden Cloud varlist ID
//  - array of strings, treated as a list of Garden Cloud varlist IDs
//  - array of objects, treated as a list of different remote var configs
export const getRemoteVariablesBaseSchema = () =>
  joi.alternatives().try(
    joi.string(),
    joi.array().items(joi.string()),
    joi.array().items(
      joi.object().keys({
        source: joi.string().valid("garden-cloud").required(),
        varlist: joi.string().required(),
      })
    )
  )

export const projectSchema = createSchema({
  name: "Project",
  description:
    "Configuration for a Garden project. This should be specified in the garden.yml file in your project root.",
  required: true,
  keys: () => ({
    apiVersion: projectApiVersionSchema(),
    kind: joi.string().default("Project").valid("Project").description("Indicate what kind of config this is."),
    path: projectRootSchema().meta({ internal: true }),
    configPath: joi.string().meta({ internal: true }).description("The path to the project config file."),
    internal: baseInternalFieldsSchema(),
    name: projectNameSchema(),
    // TODO: Remove id field once backend v1 has been phased out
    id: joi
      .string()
      .meta({ internal: true })
      .description("The project's ID in Garden Cloud (for older versions of the backend)."),
    domain: joi
      .string()
      .uri()
      .meta({ internal: true })
      .description("The domain to use for cloud features. Should be the full API/backend URL."),
    // Note: We provide a different schema below for actual validation, but need to define it this way for docs
    // because joi.alternatives() isn't handled well in the doc generation.
    organizationId: joi
      .string()
      .description("The ID of the organization that this project belongs to in Garden Cloud."),
    environments: joi
      .array()
      .min(1)
      .required()
      .items(environmentSchema())
      .description((<any>environmentsSchema().describe().flags).description),
    providers: joiSparseArray(providerConfigBaseSchema()).description(
      "A list of providers that should be used for this project, and their configuration. " +
        "Please refer to individual plugins/providers for details on how to configure them."
    ),
    defaultEnvironment: joi
      .environment()
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
    dotIgnoreFile: joi
      .posixPath()
      .filenameOnly()
      .default(defaultDotIgnoreFile)
      .description(
        deline`
      Specify a filename that should be used as ".ignore" file across the project, using the same syntax and semantics as \`.gitignore\` files. By default, patterns matched in \`.gardenignore\` files, found anywhere in the project, are ignored when scanning for actions and action sources.

      Note that this take precedence over the project \`scan.include\` field, and action \`include\` fields, so any paths matched by the .ignore file will be ignored even if they are explicitly specified in those fields.

      See the [Configuration Files guide](${DOCS_BASE_URL}/using-garden/configuration-overview#including-excluding-files-and-directories) for details.
    `
      )
      .example(".gitignore"),
    excludeValuesFromActionVersions: joi
      .sparseArray()
      .items(joi.string())
      .description(
        dedent`
        A list of string values that should be excluded when computing action versions.

        Setting values here is equivalent to adding them to the \`version.excludeValues\` field on all actions in the project.

        These values can be templated, and generally should be templated. A typical example is to exclude the namespace of the environment, or a hostname suffix used across many Deploy actions. For example:

        \`\`\`yaml
        excludeValuesFromActionVersions:
          - "\${var.hostname-suffix}"  # resolving to something like "my-branch.dev.my-org.com"
        \`\`\`

        **Important:**
        You should be careful to not make these values too broad, since the strings will be replaced for every field in all actions across the project when computing versions. For example, if a value here resolves to a short and generic string like "api", the string "api" will be replaced for every field in all actions across the project when computing versions. This could lead to unexpected issues like tests getting skipped when they shouldn't, deployments not updating etc.

        However, something more specific like a branch name, commit hash, PR number etc., ideally with some specific prefix or suffix, is generally safer to do. That said, this field only affects version computation, not the actual action configuration when it's executed.
      `
      ),
    proxy: joi.object().keys({
      hostname: joi
        .string()
        .default("localhost")
        .description(
          dedent`
        The URL that Garden uses when creating port forwards. Defaults to "localhost".

        Note that the \`GARDEN_PROXY_DEFAULT_ADDRESS\` environment variable takes precedence over this value.
        `
        )
        .example(["127.0.0.1"]),
    }),
    scan: projectScanSchema().description("Control where and how to scan for configuration files in the project."),
    outputs: joiSparseArray(projectOutputSchema())
      .unique("name")
      .description(
        dedent`
      A list of output values that the project should export. These are exported by the \`garden get outputs\` command, as well as when referencing a project as a sub-project within another project.

      You may use any template strings to specify the values, including references to provider outputs, action
      outputs and runtime outputs. For a full reference, see the [Output configuration context](./template-strings/project-outputs.md) section in the Template String Reference.

      Note that if any runtime outputs are referenced, the referenced services and tasks will be deployed and run if necessary when resolving the outputs.
      `
      ),
    sources: projectSourcesSchema(),
    varfile: joi
      .posixPath()
      .default(defaultProjectVarfilePath)
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
    importVariables: getRemoteVariablesBaseSchema()
      .description(
        dedent`
      EXPERIMENTAL: This is an experimental feature that requires enabling variables for your organization in Garden Cloud (currenty only
      available in early access).

      Specify a variable list (or array of variable lists) from which to load variables/secrets. The lists and their variables/secrets are created in [Garden Cloud](https://app.garden.io/variables).

      If an array of variable lists is provided, the variable are merged in the order of the lists (so the value from a variable in a list that appears later in the array overwrites the value of a
      variable from an earlier list if they have the same name).
    `
      )
      .default([])
      .example("varlist_abc")
      .example(["varlist_abc", "varlist_def"]),
  }),
  oxor: [["id", "organizationId"]],
})

export function getDefaultEnvironmentName(defaultName: string, config: ProjectConfig): string {
  const environments = config.environments

  // the default environment is the first specified environment in the config, unless specified
  if (!defaultName) {
    return environments[0].name
  } else {
    if (!findByName(environments, defaultName)) {
      throw new ConfigurationError({
        message: dedent`
          The default environment '${defaultName}' (specified in the project configuration) does not exist.

          Available environments: ${naturalList(getNames(environments))}`,
      })
    }
    return defaultName
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
  log,
  defaultEnvironmentName,
  config,
  context,
}: {
  log: Log
  defaultEnvironmentName: string
  config: ProjectConfig
  context: ProjectConfigContext
}): ProjectConfig {
  // Resolve template strings for non-environment-specific fields (apart from `sources` and `excludeValuesFromActionVersions`).
  const {
    variables = {},
    environments = [],
    name,
    sources = [],
    providers = [],
    outputs = [],
    excludeValuesFromActionVersions = [],
  } = config

  let globalConfig: any

  try {
    globalConfig = deepEvaluate(
      {
        apiVersion: config.apiVersion,
        varfile: config.varfile,
        environments: [],
        sources: [],
      },
      {
        context,
        opts: {},
      }
    )
  } catch (err) {
    log.error("Failed to resolve project configuration.")
    log.error(styles.bold(renderDivider()))
    throw err
  }

  // Validate after resolving global fields
  config = validateConfig({
    config: {
      ...config,
      ...globalConfig,
      name,
      defaultEnvironment: defaultEnvironmentName,
      // environments, providers, excludeValuesFromActionVersions and sources are validated later
      excludeValuesFromActionVersions: [],
      environments: [{ defaultNamespace: null, name: "fake-env-only-here-for-initial-load", variables: {} }],
      providers: [],
      sources: [],
      variables: {},
      // this makes sure that the output declaration shape is valid
      outputs: serialiseUnresolvedTemplates(outputs),
    },
    schema: projectSchema(),
    projectRoot: config.path,
    yamlDocBasePath: [],
  })

  config = {
    ...config,
    environments,
    providers,
    sources,
    outputs,
    variables,
    excludeValuesFromActionVersions,
  }

  config.defaultEnvironment = getDefaultEnvironmentName(defaultEnvironmentName, config)

  return config
}

export class UnresolvedProviderConfig {
  constructor(
    public readonly name: string,
    public readonly dependencies: string[],
    public readonly unresolvedConfig: ParsedTemplate,
    // TODO: source mapping for better error messages
    public readonly source?: ConfigSource
  ) {}
}

/**
 * Given an environment name, pulls the relevant environment-specific configuration from the specified project
 * config, and merges values appropriately. Also resolves template strings in the picked environment.
 *
 * For project variables, we apply the variables specified to the selected environment on the global variables
 * specified on the top-level `variables` key using a JSON Merge Patch (https://tools.ietf.org/html/rfc7396).
 * We also attempt to load the configured varfiles, and include those in the merge. The precedence order is as follows:
 *
 *   environment.varfile > environment.variables > project.varfile > project.variables
 *
 * Variables passed through the `--var` CLI option have the highest precedence, and are merged in later in the flow
 * (see `resolveGardenParams`).
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
export const pickEnvironment = profileAsync(async function _pickEnvironment({
  projectConfig,
  variableOverrides,
  envString,
  artifactsPath,
  vcsInfo,
  username,
  loggedIn,
  cloudBackendDomain,
  secrets,
  commandInfo,
  projectContext,
  localEnvOverrides,
}: {
  projectContext: ProjectConfigContext
  variableOverrides: DeepPrimitiveMap
  projectConfig: ProjectConfig
  envString: string
  artifactsPath: string
  vcsInfo: VcsInfo
  username: string
  loggedIn: boolean
  cloudBackendDomain: string
  secrets: PrimitiveMap
  commandInfo: CommandInfo
  localEnvOverrides: StringMap
}) {
  const { environments, name: projectName, path: projectRoot } = projectConfig
  const parsed = parseEnvironment(envString)
  const { environment } = parsed
  let { namespace } = parsed

  let environmentConfig: EnvironmentConfig | undefined
  let index = -1

  for (const env of environments) {
    index++
    if (env.name === environment) {
      environmentConfig = env
      break
    }
  }

  if (!environmentConfig) {
    const definedEnvironments = getNames(environments)

    throw new ParameterError({
      message: `Project ${projectName} does not specify environment ${environment} (Available environments: ${naturalList(
        definedEnvironments
      )})`,
    })
  }

  const source = { yamlDoc: projectConfig.internal.yamlDoc, path: ["environments", index] }

  // Resolve template strings in the environment config, except providers
  const context = new EnvironmentConfigContext({
    projectName,
    projectRoot,
    artifactsPath,
    vcsInfo,
    username,
    variables: await VariablesContext.forProject(projectConfig, variableOverrides, projectContext),
    loggedIn,
    cloudBackendDomain,
    backendType: getBackendType(projectConfig),
    secrets,
    commandInfo,
    localEnvOverrides,
  })

  // resolve project variables incl. varfiles
  deepResolveContext("project", context.variables)

  const config = deepEvaluate(
    {
      ...environmentConfig,
      // we leave variables unresolved, so we can cross-reference them
      variables: {},
    },
    {
      context,
      opts: {},
    }
  )

  environmentConfig = {
    ...validateWithPath<EnvironmentConfig>({
      config,
      schema: environmentSchema(),
      configType: `environment ${environment}`,
      path: projectConfig.path,
      projectRoot: projectConfig.path,
      source,
    }),
    // we leave variables unresolved, so we can cross-reference them
    variables: environmentConfig.variables,
  }

  namespace = getNamespace(environmentConfig, namespace)

  const fixedProviders = fixedPlugins.map((name) => ({ name }))
  const allProviders = [
    ...fixedProviders,
    ...projectConfig.providers.filter((p) => {
      const { resolved } = evaluate(p, { context, opts: {} })
      if (!isPlainObject(resolved)) {
        throw new ConfigurationError({
          message: `expected provider config to be an object, actually got ${typeof resolved}`,
        })
      }
      const envs = deepEvaluate(resolved.environments, { context, opts: {} }) as string[] | undefined

      return !envs || envs.includes(environment)
    }),
  ]

  const rawProviderConfigs: { [name: string]: ParsedTemplate[] } = {}

  for (const p of allProviders) {
    const { resolved } = evaluate(p, { context, opts: {} })
    if (!isPlainObject(resolved)) {
      throw new ConfigurationError({
        message: `expected provider config to be an object, actually got ${typeof resolved}`,
      })
    }

    const name = deepEvaluate(resolved.name, { context, opts: {} })

    if (typeof name !== "string") {
      throw new ConfigurationError({
        message: `expected provider name to be a string, actually got ${typeof resolved}`,
      })
    }

    if (!!rawProviderConfigs[name]) {
      rawProviderConfigs[name].push(p as ParsedTemplate)
    } else {
      rawProviderConfigs[name] = [p as ParsedTemplate]
    }
  }

  const mergedProviders: { [name: string]: UnresolvedProviderConfig } = {}

  for (const name in rawProviderConfigs) {
    const unresolvedConfig = new LazyMergePatch(rawProviderConfigs[name])
    const { resolved: preview } = evaluate(unresolvedConfig, { context, opts: {} })

    if (!isPlainObject(preview)) {
      throw new InternalError({
        message: `Provider config evaluated to ${typeof preview}, expected object.`,
      })
    }

    const dependencies = deepEvaluate(preview["dependencies"], { context, opts: {} }) as string[] | undefined
    if (!(dependencies === undefined || (isArray(dependencies) && dependencies.every((d) => typeof d === "string")))) {
      throw new InternalError({
        message: `Dependencies in provider config to ${typeof dependencies}, expected string array.`,
      })
    }

    mergedProviders[name] = new UnresolvedProviderConfig(name, dependencies || [], unresolvedConfig)
  }

  const variables = await VariablesContext.forEnvironment(
    environment,
    projectConfig,
    environmentConfig,
    variableOverrides,
    context
  )

  // resolve project and environment-level variables incl. varfiles
  deepResolveContext("project environment", context.variables)

  return {
    environmentName: environment,
    namespace,
    defaultNamespace: environmentConfig.defaultNamespace,
    production: !!environmentConfig.production,
    providers: Object.values(mergedProviders),
    variables,
  }
})

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
    const exampleFlag = styles.accent(`--env=${styles.bold("some-namespace.")}${envName}`)

    throw new ParameterError({
      message: `Environment ${styles.accent.bold(
        envName
      )} has defaultNamespace set to null in the project configuration, and no explicit namespace was specified. Please either set a defaultNamespace or explicitly set a namespace at runtime (e.g. ${exampleFlag}).`,
    })
  }

  return namespace
}

export function parseEnvironment(env: string): ParsedEnvironment {
  const result = joi.environment().validate(env, { errors: { label: false } })

  if (result.error) {
    throw new ValidationError({
      message: `Invalid environment specified (${env}): ${result.error.message}`,
    })
  }

  // Note: This is validated above to be either one or two parts
  const split = env.split(".")

  if (split.length === 1) {
    return { environment: env }
  } else {
    return { environment: split[1], namespace: split[0] }
  }
}

function isStringArray(arr: (string | ImportVarsSourceGardenCloud)[]): arr is string[] {
  return arr.length === 0 || typeof arr[0] === "string"
}

/**
 * Returns a list of varlist IDs from the remote variables config.
 *
 * Remote variables default to Garden Cloud as the source so if the user only supplies a string
 * or an array of strings it's treated as varlist IDs.
 */
export function getVarlistIdsFromRemoteVarsConfig(remoteVars: ImportVariablesConfig): string[] {
  if (remoteVars === undefined) {
    return []
  }

  if (typeof remoteVars === "string") {
    return [remoteVars]
  }

  if (Array.isArray(remoteVars)) {
    if (remoteVars.length === 0) {
      return []
    }

    if (isStringArray(remoteVars)) {
      return remoteVars
    } else {
      return remoteVars.map((config) => config.varlist)
    }
  }

  return []
}
