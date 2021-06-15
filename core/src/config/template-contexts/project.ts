/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { last, isEmpty } from "lodash"
import chalk from "chalk"
import { PrimitiveMap, joiIdentifierMap, joiStringMap, joiPrimitive, DeepPrimitiveMap, joiVariables } from "../common"
import { joi } from "../common"
import { deline, dedent } from "../../util/string"
import { schema, ConfigContext, ContextKeySegment, EnvironmentContext } from "./base"
import { CommandInfo } from "../../plugin-context"
import { Garden } from "../../garden"

class LocalContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description("The absolute path to the directory where exported artifacts from test and task runs are stored.")
      .example("/home/me/my-project/.garden/artifacts")
  )
  public artifactsPath: string

  @schema(
    joiStringMap(joi.string().description("The environment variable value."))
      .description(
        "A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env)."
      )
      .meta({ keyPlaceholder: "<env-var-name>" })
  )
  public env: typeof process.env

  @schema(
    joi
      .string()
      .description(
        "A string indicating the platform that the framework is running on " +
          "(see https://nodejs.org/api/process.html#process_process_platform)"
      )
      .example("posix")
  )
  public platform: string

  @schema(joi.string().description("The absolute path to the project root directory.").example("/home/me/my-project"))
  public projectPath: string

  @schema(
    joi
      .string()
      .description("The current username (as resolved by https://github.com/sindresorhus/username).")
      .example("tenzing_norgay")
  )
  public username?: string

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
  public usernameLowerCase?: string

  constructor(root: ConfigContext, artifactsPath: string, projectRoot: string, username?: string) {
    super(root)
    this.artifactsPath = artifactsPath
    this.env = process.env
    this.platform = process.platform
    this.projectPath = projectRoot
    this.username = username
    this.usernameLowerCase = username ? username.toLowerCase() : undefined
  }
}

class ProjectContext extends ConfigContext {
  @schema(joi.string().description("The name of the Garden project.").example("my-project"))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

class GitContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description(
        dedent`
          The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
          (e.g. when rebasing), or if the repository has no commits.

          When using remote sources, the branch used is that of the project/top-level repository (the one that contains
          the project configuration).

          The branch is computed at the start of the Garden command's execution, and is not updated if the current
          branch changes during the command's execution (which could happen, for example, when using watch-mode
          commands).
        `
      )
      .example("my-feature-branch")
  )
  public branch: string

  constructor(root: ConfigContext, branch: string) {
    super(root)
    this.branch = branch
  }
}

const commandHotExample = "${command.params contains 'hot-reload' && command.params.hot-reload contains 'my-service'}"

class CommandContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description(
        dedent`
        The currently running Garden CLI command, without positional arguments or option flags. This can be handy to e.g. change some variables based on whether you're running \`garden test\` or some other specific command.

        Note that this will currently always resolve to \`"run workflow"\` when running Workflows, as opposed to individual workflow step commands. This may be revisited at a later time, but currently all configuration is resolved once for all workflow steps.
        `
      )
      .example("deploy")
  )
  public name: string

  @schema(
    joiStringMap(joi.any())
      .description(
        dedent`
        A map of all parameters set when calling the current command. This includes both positional arguments and option flags, and includes any default values set by the framework or specific command. This can be powerful if used right, but do take care since different parameters are only available in certain commands, some have array values etc.

        For example, to see if a service is in hot-reload mode, you might do something like \`${commandHotExample}\`. Notice that you currently need to check both for the existence of the parameter, and also to correctly handle the array value.

        Option values can be referenced by the option's default name (e.g. \`dev-mode\`) or its alias (e.g. \`dev\`) if one is defined for that option.
        `
      )
      .example({ force: true, hot: ["my-service"] })
  )
  public params: DeepPrimitiveMap

  constructor(root: ConfigContext, commandInfo: CommandInfo) {
    super(root)
    this.name = commandInfo.name
    this.params = { ...commandInfo.args, ...commandInfo.opts }
  }
}

interface DefaultEnvironmentContextParams {
  projectName: string
  projectRoot: string
  artifactsPath: string
  branch: string
  username?: string
  commandInfo: CommandInfo
}

/**
 * This context is available for template strings in the `defaultEnvironment` field in project configs.
 */
export class DefaultEnvironmentContext extends ConfigContext {
  @schema(
    LocalContext.getSchema().description(
      "Context variables that are specific to the currently running environment/machine."
    )
  )
  public local: LocalContext

  @schema(CommandContext.getSchema().description("Information about the currently running command and its arguments."))
  public command: CommandContext

  @schema(ProjectContext.getSchema().description("Information about the Garden project."))
  public project: ProjectContext

  @schema(
    GitContext.getSchema().description("Information about the current state of the project's local git repository.")
  )
  public git: GitContext

  constructor({
    projectName,
    projectRoot,
    artifactsPath,
    branch,
    username,
    commandInfo,
  }: DefaultEnvironmentContextParams) {
    super()
    this.local = new LocalContext(this, artifactsPath, projectRoot, username)
    this.git = new GitContext(this, branch)
    this.project = new ProjectContext(this, projectName)
    this.command = new CommandContext(this, commandInfo)
  }
}

export interface ProjectConfigContextParams extends DefaultEnvironmentContextParams {
  loggedIn: boolean
  secrets: PrimitiveMap
  enterpriseDomain: string | undefined
}

/**
 * This context is available for template strings for all Project config fields (except `name`, `id` and
 * `domain`).
 *
 * Template strings in `defaultEnvironmentName` have access to all fields in this context, except for
 * `secrets`.
 */
export class ProjectConfigContext extends DefaultEnvironmentContext {
  @schema(
    joiStringMap(joi.string().description("The secret's value."))
      .description("A map of all secrets for this project in the current environment.")
      .meta({
        internal: true,
        keyPlaceholder: "<secret-name>",
      })
  )
  public secrets: PrimitiveMap
  private _enterpriseDomain: string | undefined
  private _loggedIn: boolean

  getMissingKeyErrorFooter(_key: ContextKeySegment, path: ContextKeySegment[]): string {
    if (last(path) !== "secrets") {
      return ""
    }

    if (!this._loggedIn) {
      return dedent`
        You are not logged in to Garden Enterprise, but one or more secrets are referenced in template strings in your Garden configuration files.

        Please log in via the ${chalk.green("garden login")} command to use Garden with secrets.
      `
    }

    if (isEmpty(this.secrets)) {
      // TODO: Provide project ID (not UID) to this class so we can render a full link to the secrets section of the
      // project. To do this, we'll also need to handle the case where the project doesn't already exist in GE/CLoud.
      const suffix = this._enterpriseDomain
        ? ` To create secrets, please visit ${this._enterpriseDomain} and navigate to the secrets section for this project.`
        : ""
      return deline`
        Looks like no secrets have been created for this project and/or environment in Garden Enterprise.${suffix}
      `
    } else {
      return deline`
        Please make sure that all required secrets for this project exist in Garden Enterprise, and are accessible in this
        environment.
      `
    }
  }

  constructor(params: ProjectConfigContextParams) {
    super(params)
    this._loggedIn = params.loggedIn
    this.secrets = params.secrets
    this._enterpriseDomain = params.enterpriseDomain
  }
}

interface EnvironmentConfigContextParams extends ProjectConfigContextParams {
  variables: DeepPrimitiveMap
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
  public variables: DeepPrimitiveMap

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public var: DeepPrimitiveMap

  @schema(
    joiStringMap(joi.string().description("The secret's value."))
      .description("A map of all secrets for this project in the current environment.")
      .meta({
        internal: true,
        keyPlaceholder: "<secret-name>",
      })
  )
  public secrets: PrimitiveMap

  constructor(params: EnvironmentConfigContextParams) {
    super(params)
    this.variables = this.var = params.variables
  }
}

export class RemoteSourceConfigContext extends EnvironmentConfigContext {
  @schema(
    EnvironmentContext.getSchema().description("Information about the environment that Garden is running against.")
  )
  public environment: EnvironmentContext

  // Overriding to update the description. Same schema as base.
  @schema(
    joiVariables()
      .description(
        "A map of all variables defined in the project configuration, including environment-specific variables."
      )
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public variables: DeepPrimitiveMap

  constructor(garden: Garden) {
    super({
      projectName: garden.projectName,
      projectRoot: garden.projectRoot,
      artifactsPath: garden.artifactsPath,
      branch: garden.vcsBranch,
      username: garden.username,
      variables: garden.variables,
      loggedIn: !!garden.enterpriseApi,
      enterpriseDomain: garden.enterpriseApi?.domain,
      secrets: garden.secrets,
      commandInfo: garden.commandInfo,
    })

    const fullEnvName = garden.namespace ? `${garden.namespace}.${garden.environmentName}` : garden.environmentName
    this.environment = new EnvironmentContext(this, garden.environmentName, fullEnvName, garden.namespace)
  }
}
