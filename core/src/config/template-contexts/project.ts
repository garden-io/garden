/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PrimitiveMap, joiIdentifierMap, joiStringMap, joiPrimitive, DeepPrimitiveMap, joiVariables } from "../common"
import { joi } from "../common"
import { deline, dedent } from "../../util/string"
import { schema, ConfigContext } from "./base"

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
  }: {
    projectName: string
    projectRoot: string
    artifactsPath: string
    branch: string
    username?: string
  }) {
    super()
    this.local = new LocalContext(this, artifactsPath, projectRoot, username)
    this.git = new GitContext(this, branch)
    this.project = new ProjectContext(this, projectName)
  }
}

export interface ProjectConfigContextParams {
  projectName: string
  projectRoot: string
  artifactsPath: string
  branch: string
  username?: string
  secrets: PrimitiveMap
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

  constructor({ projectName, projectRoot, artifactsPath, branch, username, secrets }: ProjectConfigContextParams) {
    super({ projectName, projectRoot, artifactsPath, branch, username })
    this.secrets = secrets
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

  constructor({
    projectName,
    projectRoot,
    artifactsPath,
    branch,
    username,
    variables,
    secrets,
  }: EnvironmentConfigContextParams) {
    super({ projectName, projectRoot, artifactsPath, branch, username, secrets })
    this.variables = this.var = variables
  }
}
