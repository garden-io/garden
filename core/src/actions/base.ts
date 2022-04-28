/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import titleize from "titleize"
import {
  ActionReference,
  apiVersionSchema,
  DeepPrimitiveMap,
  includeGuideLink,
  joi,
  joiIdentifier,
  joiRepositoryUrl,
  joiSparseArray,
  joiUserIdentifier,
  joiVariables,
  parseActionReference,
} from "../config/common"
import { varfileDescription } from "../config/project"
import { DOCS_BASE_URL } from "../constants"
import { dedent, naturalList } from "../util/string"
import { ModuleVersion } from "../vcs/vcs"
import type { BuildActionConfig } from "./build"
import type { DeployActionConfig } from "./deploy"
import type { RunActionConfig } from "./run"
import type { TestActionConfig } from "./test"

export type ActionKind = "build" | "deploy" | "run" | "test"
export const actionKinds = ["build", "deploy", "run", "test"]

interface SourceRepositorySpec {
  url: string
  // TODO: subPath?: string
  // TODO: commitHash?: string
}

export interface ActionSourceSpec {
  path?: string
  repository?: SourceRepositorySpec
}

const actionSourceSpecSchema = () =>
  joi
    .object()
    .keys({
      path: joi
        .posixPath()
        .relativeOnly()
        .description(
          `A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is ina git repository!`
        ),
      repository: joi
        .object()
        .keys({
          url: joiRepositoryUrl().required(),
        })
        .description(
          `When set, Garden will import the action source from this repository, but use this action configuration (and not scan for configs in the separate repository).`
        ),
    })
    .description(
      dedent`
        By default, the directory where the action is defined is used as the source for the build context.

        You can override this by setting either \`source.path\` to another (POSIX-style) path relative to the action source directory, or \`source.repository\` to get the source from an external repository.

        If using \`source.path\`, you must make sure the target path is in a git repository.

        For \`source.repository\` behavior, please refer to the [Remote Sources guide](${DOCS_BASE_URL}/advanced/using-remote-sources).
      `
    )
    .xor("path", "url")
    .meta({ advanced: true })

export interface BaseActionConfig<K extends ActionKind = any, N = any, S = any> {
  // Basics
  apiVersion?: string
  kind: `${Capitalize<K>}`
  type: N
  name: string
  description?: string

  // Location
  basePath: string
  source?: ActionSourceSpec

  // Internal metadata
  internal?: {
    configFilePath?: string
    moduleName?: string // For backwards-compatibility, applied on actions returned from module conversion handlers
    // -> set by templates
    parentName?: string
    templateName?: string
    inputs?: DeepPrimitiveMap
  }

  // Flow/execution control
  dependencies?: (string | ActionReference)[]
  disabled?: boolean

  // Version/file handling
  include?: string[]
  exclude?: string[]

  // Variables
  variables?: DeepPrimitiveMap
  varfiles?: string[]

  // Type-specific
  spec: S
}

export const includeExcludeSchema = () => joi.array().items(joi.posixPath().allowGlobs().subPathOnly())

export const baseActionConfig = () =>
  joi.object().keys({
    // Basics
    apiVersion: apiVersionSchema(),
    kind: joi
      .string()
      .required()
      .allow(...actionKinds)
      .description(`The kind of action you want to define (one of ${naturalList(actionKinds.map(titleize), "or")}).`),
    type: joiIdentifier()
      .required()
      .description(
        "The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be defined by your configured providers."
      ),
    name: joiUserIdentifier()
      .required()
      .description(
        "A valid name for the action. Must be unique across all actions of the same _kind_ in your project."
      ),
    description: joi.string().description("A description of the action."),

    // Location
    source: actionSourceSpecSchema(),

    // Flow/execution control
    dependencies: joiSparseArray(joi.actionReference())
      .description(
        dedent`
        A list of other actions that this action depends on, and should be built, deployed or run (depending on the action type) before processing this action.

        Each dependency should generally be expressed as a \`"<kind>.<name>"\` string, where _<kind>_ is one of \`build\`, \`deploy\`, \`run\` or \`test\`, and _<name>_ is the name of the action to depend on.

        You may also optionally specify a dependency as an object, e.g. \`{ kind: "build", name: "some-image" }\`.

        Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via template expressions.
        `
      )
      .example(["build.my-image", "deploy.api"]),
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        Set this to \`true\` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

        For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

        For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.
      `
      ),

    // Version/file handling (Note: Descriptions and behaviors are different on Build actions!)
    include: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

        For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an \`exec\` action without a \`build\` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

        _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

        Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.`
      )
      .example(["my-app.js", "some-assets/**/*"]),
    exclude: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

        For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set \`include\` paths, or such paths inferred by providers. See the [Configuration Files guide](${includeGuideLink}) for details.

        Unlike the \`scan.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project \`scan.exclude\` field to affect those, if you have large directories that should not be watched for changes.
        `
      )
      .example(["tmp/**/*", "*.log"]),

    // Variables
    variables: joiVariables().default(() => undefined).description(dedent`
      A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.
    `),
    varfiles: joi
      .posixPath()
      .description(
        dedent`
          Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level \`variables\` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

          If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

          ${varfileDescription}

          To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. \`varfile: "my-action.\$\{environment.name\}.env\` (this assumes that the corresponding varfiles exist).

          If a listed varfile cannot be found, it is ignored.
        `
      )
      .example("my-action.env"),
  })

export interface BaseRuntimeActionConfig<K extends ActionKind = any, N = any, S = any>
  extends BaseActionConfig<K, N, S> {
  build?: string
}

export const baseRuntimeActionConfig = () =>
  baseActionConfig().keys({
    build: joiUserIdentifier().description(
      dedent(
        `Specify a _Build_ action, and resolve this action from the context of that Build.

        For example, you might create an \`exec\` Build which prepares some manifests, and then reference that in a \`kubernetes\` _Deploy_ action, and the resulting manifests from the Build.

        This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced \`exec\` Build would be the source.
        `
      )
    ),
  })

export interface ActionConfigTypes {
  build: BuildActionConfig
  deploy: DeployActionConfig
  run: RunActionConfig
  test: TestActionConfig
}

interface ActionWrapperParams<C extends BaseActionConfig, O extends {}> {
  // TODO-G2: need to vary this based on build field
  buildPath: string
  buildMetadataPath: string
  config: C
  moduleName: string
  outputs: O
  version: ModuleVersion
}

export class Action<C extends BaseActionConfig = BaseActionConfig, O extends {} = any> {
  public readonly name: string
  public readonly buildPath: string
  public readonly buildMetadataPath: string
  public readonly moduleName: string // Temporary, during transition
  public readonly version: ModuleVersion

  private config: C
  private outputs: O

  constructor(params: ActionWrapperParams<C, O>) {
    this.name = params.config.name
    this.buildPath = params.buildPath
    this.buildMetadataPath = params.buildMetadataPath
    this.moduleName = params.moduleName
    this.config = params.config
    this.version = params.version
  }

  getBasePath(): string {
    // TODO-G2
    // TODO: handle repository.url
    return this.config.basePath
  }

  getDependencyReferences(): ActionReference[] {
    return this.config.dependencies?.map(parseActionReference) || []
  }

  getConfig(key: keyof C) {
    return this.config[key]
  }

  getSpec(): C["spec"]
  getSpec<K extends keyof C["spec"]>(key: K): C["spec"][K]
  getSpec(key?: keyof C["spec"]) {
    return key ? this.config.spec[key] : this.config.spec
  }

  getOutput<K extends keyof O>(key: K) {
    return this.outputs[key]
  }
}

export type GetActionOutputType<T> = T extends Action<any, infer O> ? O : any
