/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty } from "lodash-es"
import type { PrimitiveMap, DeepPrimitiveMap } from "../common.js"
import { joiIdentifierMap, joiStringMap, joiPrimitive, joiVariables } from "../common.js"
import { joi } from "../common.js"
import { deline, dedent } from "../../util/string.js"
import type { ContextResolveParams } from "./base.js"
import { schema, ContextWithSchema, EnvironmentContext } from "./base.js"
import type { CommandInfo } from "../../plugin-context.js"
import type { Garden } from "../../garden.js"
import { type VcsInfo } from "../../vcs/vcs.js"
import { styles } from "../../logger/styles.js"
import type { VariablesContext } from "./variables.js"
import { getBackendType, getCloudDistributionName } from "../../cloud/util.js"
import { getSecretsUnavailableInNewBackendMessage } from "../../cloud/api/secrets.js"

const secretsSchema = joiStringMap(joi.string().description("The secret's value."))
  .description("A map of all secrets for this project in the current environment.")
  .meta({
    keyPlaceholder: "<secret-name>",
  })

class LocalContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .description("The absolute path to the directory where exported artifacts from test and task runs are stored.")
      .example("/home/me/my-project/.garden/artifacts")
  )
  public readonly artifactsPath: string

  @schema(
    joiStringMap(joi.string().description("The environment variable value."))
      .description(
        "A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env)."
      )
      .meta({ keyPlaceholder: "<env-var-name>" })
  )
  public readonly env: typeof process.env

  @schema(
    joi
      .string()
      .description(
        "A string indicating the architecture that the framework is running on " +
          "(see https://nodejs.org/api/process.html#process_process_arch)"
      )
      .example("x64")
  )
  public readonly arch: string
  @schema(
    joi
      .string()
      .description(
        "A string indicating the platform that the framework is running on " +
          "(see https://nodejs.org/api/process.html#process_process_platform)"
      )
      .example("linux")
  )
  public readonly platform: string

  @schema(joi.string().description("The absolute path to the project root directory.").example("/home/me/my-project"))
  public readonly projectPath: string

  @schema(
    joi
      .string()
      .description("The current username (as resolved by https://github.com/sindresorhus/username).")
      .example("tenzing_norgay")
  )
  public readonly username?: string

  @schema(
    joi
      .string()
      .description(
        deline`
          The current username (as resolved by https://github.com/sindresorhus/username), with any upper case
          characters converted to lower case.
        `
      )
      .example("tenzing_norgay")
  )
  public readonly usernameLowerCase?: string

  constructor(artifactsPath: string, projectRoot: string, username?: string) {
    super()
    this.artifactsPath = artifactsPath
    this.arch = process.arch
    this.env = process.env
    this.platform = process.platform
    this.projectPath = projectRoot
    this.username = username
    this.usernameLowerCase = username ? username.toLowerCase() : undefined
  }
}

class ProjectContext extends ContextWithSchema {
  @schema(joi.string().description("The name of the Garden project.").example("my-project"))
  public readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

class DatetimeContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .description("The current UTC date and time, at time of template resolution, in ISO-8601 format.")
      .example("2011-10-05T14:48:00.000Z")
  )
  public readonly now: string

  @schema(
    joi
      .string()
      .description("The current UTC date, at time of template resolution, in ISO-8601 format.")
      .example("2011-10-05")
  )
  public readonly today: string

  @schema(
    joi
      .string()
      .description("The current UTC Unix timestamp (in seconds), at time of template resolution.")
      .example(1642005235)
  )
  public readonly timestamp: number

  constructor() {
    super()
    const now = new Date()

    this.now = now.toISOString()
    this.today = this.now.slice(0, 10)
    this.timestamp = Math.round(now.getTime() / 1000)
  }
}

class VcsContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .description(
        dedent`
          The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
          (e.g. when rebasing), or if the repository has no commits.

          When using remote sources, the branch used is that of the project/top-level repository (the one that contains
          the project configuration).

          The branch is resolved at the start of the Garden command's execution, and is not updated if the current branch changes during the command's execution (which could happen, for example, when using watch-mode commands).
        `
      )
      .example("my-feature-branch")
  )
  public readonly branch: string

  @schema(
    joi
      .string()
      .description(
        dedent`
          The current Git commit hash, if available. Resolves to an empty string if the repository has no commits.

          When using remote sources, the hash used is that of the project/top-level repository (the one that contains the project configuration).

          The hash is resolved at the start of the Garden command's execution, and is not updated if the current commit changes during the command's execution (which could happen, for example, when using watch-mode commands).
        `
      )
      .example("my-feature-branch")
  )
  public readonly commitHash: string

  @schema(
    joi
      .string()
      .description(
        dedent`
          The remote origin URL of the project Git repository.

          When using remote sources, the URL is that of the project/top-level repository (the one that contains the project configuration).
        `
      )
      .example("my-feature-branch")
  )
  public readonly originUrl: string

  constructor(info: VcsInfo) {
    super()
    this.branch = info.branch
    this.commitHash = info.commitHash
    this.originUrl = info.originUrl
  }
}

class CommandContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .description(
        dedent`
        The currently running Garden CLI command, without positional arguments or option flags. This can be handy to e.g. change some variables based on whether you're running \`garden test\` or some other specific command.

        Note that this will currently always resolve to \`"workflow"\` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.
        `
      )
      .example("deploy")
  )
  public readonly name: string

  @schema(
    joiStringMap(joi.any())
      .description(
        dedent`
        A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

        Option values can be referenced by the option's default name (e.g. \`sync-mode\`) or its alias (e.g. \`sync\`) if one is defined for that option.
        `
      )
      .example({ force: true, dev: ["my-service"] })
  )
  public readonly params: DeepPrimitiveMap

  constructor(commandInfo: CommandInfo) {
    super()
    this.name = commandInfo.name
    this.params = { ...commandInfo.args, ...commandInfo.opts }
  }
}

export interface DefaultEnvironmentContextParams {
  projectName: string
  projectRoot: string
  artifactsPath: string
  username?: string
  commandInfo: CommandInfo
  vcsInfo: VcsInfo
}

/**
 * This context is available for template strings in the `defaultEnvironment` field in project configs.
 */
export class DefaultEnvironmentContext extends ContextWithSchema {
  @schema(
    LocalContext.getSchema().description(
      "Context variables that are specific to the currently running environment/machine."
    )
  )
  public readonly local: LocalContext

  @schema(CommandContext.getSchema().description("Information about the currently running command and its arguments."))
  public readonly command: CommandContext

  @schema(DatetimeContext.getSchema().description("Information about the date/time at template resolution time."))
  public readonly datetime: DatetimeContext

  @schema(ProjectContext.getSchema().description("Information about the Garden project."))
  public readonly project: ProjectContext

  @schema(VcsContext.getSchema().description("Information about the current state of the project's Git repository."))
  public readonly git: VcsContext

  constructor({
    projectName,
    projectRoot,
    artifactsPath,
    vcsInfo,
    username,
    commandInfo,
  }: DefaultEnvironmentContextParams) {
    super()
    this.local = new LocalContext(artifactsPath, projectRoot, username)
    this.datetime = new DatetimeContext()
    this.git = new VcsContext(vcsInfo)
    this.project = new ProjectContext(projectName)
    this.command = new CommandContext(commandInfo)
  }
}

export interface ProjectConfigContextParams extends DefaultEnvironmentContextParams {
  loggedIn: boolean
  secrets: PrimitiveMap
  cloudBackendDomain: string
  backendType: "v1" | "v2"
}

/**
 * This context is available for template strings for all Project config fields (except `name`, `id` and
 * `domain`).
 *
 * Template strings in `defaultEnvironmentName` have access to all fields in this context, except for
 * `secrets`.
 */
export class ProjectConfigContext extends DefaultEnvironmentContext {
  @schema(secretsSchema)
  public readonly secrets: PrimitiveMap
  private readonly _cloudBackendDomain: string
  private readonly _backendType: "v1" | "v2"
  private readonly _loggedIn: boolean

  constructor(params: ProjectConfigContextParams) {
    super(params)
    this._loggedIn = params.loggedIn
    this.secrets = params.secrets
    this._cloudBackendDomain = params.cloudBackendDomain
    this._backendType = params.backendType
  }

  override getMissingKeyErrorFooter({ key }: ContextResolveParams): string {
    if (key[0] !== "secrets") {
      return ""
    }

    if (this._backendType === "v2") {
      return getSecretsUnavailableInNewBackendMessage(this._cloudBackendDomain)
    }

    const distributionName = getCloudDistributionName(this._cloudBackendDomain)

    if (!this._loggedIn) {
      return dedent`
        You are not logged in to ${distributionName}, but one or more secrets are referenced in template strings in your Garden configuration files.

        Please log in via the ${styles.command("garden login")} command to use Garden with secrets.
      `
    }

    if (isEmpty(this.secrets)) {
      // TODO: provide link to the secrets page
      return deline`
        Looks like no secrets have been created for this project and/or environment in ${distributionName}.

        To create secrets, please visit ${this._cloudBackendDomain} and navigate to the secrets section for this project.
      `
    } else {
      return deline`
        Please make sure that all required secrets for this project exist in ${distributionName}, and are accessible in this
        environment.
      `
    }
  }
}

export interface EnvironmentConfigContextParams extends ProjectConfigContextParams {
  variables: VariablesContext
}

/**
 * This context is available for template strings for all `environments[]` fields (except name)
 */
export class EnvironmentConfigContext extends ProjectConfigContext {
  @schema(
    joiVariables()
      .description("A map of all variables defined in the project configuration.")
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public variables: VariablesContext

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public var: VariablesContext

  @schema(secretsSchema)
  public override secrets: PrimitiveMap

  constructor(params: EnvironmentConfigContextParams) {
    super(params)
    this.variables = this.var = params.variables
    this.secrets = params.secrets
  }
}

export class RemoteSourceConfigContext extends EnvironmentConfigContext {
  @schema(
    EnvironmentContext.getSchema().description("Information about the environment that Garden is running against.")
  )
  public readonly environment: EnvironmentContext

  // Overriding to update the description. Same schema as base.
  @schema(
    joiVariables()
      .description(
        "A map of all variables defined in the project configuration, including environment-specific variables."
      )
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public override variables: VariablesContext

  constructor(garden: Garden, variables: VariablesContext) {
    super({
      projectName: garden.projectName,
      projectRoot: garden.projectRoot,
      artifactsPath: garden.artifactsPath,
      vcsInfo: garden.vcsInfo,
      username: garden.username,
      loggedIn: garden.isLoggedIn(),
      cloudBackendDomain: garden.cloudDomain,
      backendType: getBackendType(garden.getProjectConfig()),
      secrets: garden.secrets,
      commandInfo: garden.commandInfo,
      variables,
    })

    const fullEnvName = garden.namespace ? `${garden.namespace}.${garden.environmentName}` : garden.environmentName
    this.environment = new EnvironmentContext(garden.environmentName, fullEnvName, garden.namespace)
    this.variables = this.var = variables
  }
}

export class ExcludeValuesFromActionVersionsContext extends RemoteSourceConfigContext {}
