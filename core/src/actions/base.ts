/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import titleize from "titleize"
import type { ConfigGraph, GetActionOpts, ResolvedConfigGraph } from "../graph/config-graph"
import {
  ActionReference,
  DeepPrimitiveMap,
  includeGuideLink,
  joi,
  joiIdentifier,
  joiRepositoryUrl,
  joiSparseArray,
  joiUserIdentifier,
  joiVariables,
  parseActionReference,
  createSchema,
  unusedApiVersionSchema,
} from "../config/common"
import { DOCS_BASE_URL } from "../constants"
import { dedent, naturalList, stableStringify } from "../util/string"
import { DependencyVersions, hashStrings, ModuleVersion, TreeVersion, versionStringPrefix } from "../vcs/vcs"
import type { BuildAction, ResolvedBuildAction } from "./build"
import type { ActionKind } from "../plugin/action-types"
import pathIsInside from "path-is-inside"
import { actionOutputsSchema } from "../plugin/handlers/base/base"
import type { GraphResult, GraphResults } from "../graph/results"
import type { RunResult } from "../plugin/base"
import { Memoize } from "typescript-memoize"
import cloneDeep from "fast-copy"
import { flatten, fromPairs, isString, memoize, omit, sortBy } from "lodash"
import { ActionConfigContext, ActionSpecContext } from "../config/template-contexts/actions"
import { relative } from "path"
import { InternalError } from "../exceptions"
import {
  Action,
  ActionConfig,
  ActionDependency,
  actionKinds,
  ActionMode,
  ActionModes,
  ActionReferenceMap,
  actionStateTypes,
  ActionStatus,
  ActionWrapperParams,
  BaseActionConfig,
  ExecutedAction,
  ExecutedActionWrapperParams,
  GetOutputValueType,
  ResolvedAction,
  ResolvedActionWrapperParams,
} from "./types"
import { baseInternalFieldsSchema, varfileDescription } from "../config/base"
import { PickTypeByKind } from "../graph/config-graph"
import { DeployAction } from "./deploy"
import { TestAction } from "./test"
import { RunAction } from "./run"
import { createActionLog, Log } from "../logger/log-entry"
import { joinWithPosix, normalizeRelativePath } from "../util/fs"
import { LinkedSource } from "../config-store/local"

// TODO: split this file

const actionInternalFieldsSchema = createSchema({
  name: "action-config-internal-fields",
  extend: baseInternalFieldsSchema,
  keys: () => ({
    groupName: joi.string().optional().meta({ internal: true }),
    moduleName: joi.string().optional().meta({ internal: true }),
    resolved: joi.boolean().optional().meta({ internal: true }),
  }),
  allowUnknown: true,
  meta: { internal: true },
})

const actionSourceSpecSchema = createSchema({
  name: "action-source-spec",
  description: dedent`
    By default, the directory where the action is defined is used as the source for the build context.

    You can override this by setting either \`source.path\` to another (POSIX-style) path relative to the action source directory, or \`source.repository\` to get the source from an external repository.

    If using \`source.path\`, you must make sure the target path is in a git repository.

    For \`source.repository\` behavior, please refer to the [Remote Sources guide](${DOCS_BASE_URL}/advanced/using-remote-sources).
  `,
  keys: () => ({
    path: joi
      .posixPath()
      .relativeOnly()
      .description(
        `A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is in a git repository!`
      ),
    repository: joi
      .object()
      .keys({
        url: joiRepositoryUrl().required(),
      })
      .description(
        `When set, Garden will import the action source from this repository, but use this action configuration (and not scan for configs in the separate repository).`
      ),
  }),
  oxor: [["path", "repository"]],
  meta: { name: "action-source", advanced: true, templateContext: ActionConfigContext },
})

export const includeExcludeSchema = memoize(() => joi.array().items(joi.posixPath().allowGlobs().subPathOnly()))

export const baseActionConfigSchema = createSchema({
  name: "action-config-base",
  keys: () => ({
    // Basics
    apiVersion: unusedApiVersionSchema().meta({ templateContext: null }),
    kind: joi
      .string()
      .required()
      .allow(...actionKinds)
      .description(
        `The kind of action you want to define (one of ${naturalList(actionKinds.map(titleize), {
          trailingWord: "or",
        })}).`
      )
      .meta({ templateContext: null }),
    type: joiIdentifier()
      .required()
      .description(
        "The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be defined by your configured providers."
      )
      .meta({ templateContext: null }),
    name: joiUserIdentifier()
      .required()
      .description("A valid name for the action. Must be unique across all actions of the same _kind_ in your project.")
      .meta({ templateContext: null }),
    description: joi.string().description("A description of the action.").meta({ templateContext: null }),

    // Internal metadata fields (these are rejected in `loadConfigResources()` if specified by users)
    internal: actionInternalFieldsSchema,

    // Location
    source: actionSourceSpecSchema(),

    // Flow/execution control
    dependencies: joiSparseArray(joi.actionReference())
      .description(
        dedent`
        A list of other actions that this action depends on, and should be built, deployed or run (depending on the action type) before processing this action.

        Each dependency should generally be expressed as a \`"<kind>.<name>"\` string, where _<kind>_ is one of \`build\`, \`deploy\`, \`run\` or \`test\`, and _<name>_ is the name of the action to depend on.

        You may also optionally specify a dependency as an object, e.g. \`{ kind: "Build", name: "some-image" }\`.

        Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via template expressions.
        `
      )
      .example(["build.my-image", "deploy.api"])
      .meta({ templateContext: ActionConfigContext }),
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        Set this to \`true\` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

        For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

        For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.
      `
      )
      .meta({ templateContext: ActionConfigContext }),

    // Version/file handling (Note: Descriptions and behaviors are different on Build actions!)
    include: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

        For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an \`exec\` action without a \`build\` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

        _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

        Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.`
      )
      .example(["my-app.js", "some-assets/**/*"])
      .meta({ templateContext: ActionConfigContext }),
    exclude: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

        For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set \`include\` paths, or such paths inferred by providers. See the [Configuration Files guide](${includeGuideLink}) for details.

        Unlike the \`scan.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project \`scan.exclude\` field to affect those, if you have large directories that should not be watched for changes.
        `
      )
      .example(["tmp/**/*", "*.log"])
      .meta({ templateContext: ActionConfigContext }),

    // No default here by intention.
    // Each action kind must override this, declare it as required, and define own timeout and description.
    // FIXME: this is an ugly hack.
    //  Making it .required() will break the `augmentGraph ResolvedActionHandlerDescription`.
    //  See the FIXME-comment in core/src/plugin/handlers/Provider/augmentGraph.ts.
    timeout: joi.number().integer().optional().description("Set a timeout for the action, in seconds."),

    // Variables
    variables: joiVariables()
      .default(() => undefined)
      .description(
        dedent`
          A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.
        `
      ),
    varfiles: joiSparseArray(joi.posixPath())
      .description(
        dedent`
          Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level \`variables\` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

          If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

          ${varfileDescription}

          To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. \`varfile: "my-action.\$\{environment.name\}.env\` (this assumes that the corresponding varfiles exist).

          If a listed varfile cannot be found, it is ignored.
        `
      )
      .example("my-action.env")
      .meta({ templateContext: ActionConfigContext }),

    spec: joi
      .object()
      .unknown(true)
      .description("The spec for the specific action type.")
      .meta({ templateContext: ActionSpecContext }),
  }),
})

export interface BaseRuntimeActionConfig<K extends ActionKind = ActionKind, N = string, S = any>
  extends BaseActionConfig<K, N, S> {
  build?: string
}

export const baseRuntimeActionConfigSchema = createSchema({
  name: "runtime-action-base",
  keys: () => ({
    build: joiUserIdentifier()
      .description(
        dedent(
          `Specify a _Build_ action, and resolve this action from the context of that Build.

      For example, you might create an \`exec\` Build which prepares some manifests, and then reference that in a \`kubernetes\` _Deploy_ action, and the resulting manifests from the Build.

      This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced \`exec\` Build would be the source.
      `
        )
      )
      .meta({ templateContext: ActionConfigContext }),
  }),
  extend: baseActionConfigSchema,
})

export const actionStatusSchema = createSchema({
  name: "action-status",
  keys: () => ({
    state: joi
      .string()
      .allow(...actionStateTypes)
      .only()
      .required()
      .description("The state of the action."),
    detail: joi
      .object()
      .meta({ extendable: true })
      .allow(null)
      .description("Optional provider-specific information about the action status or results."),
    outputs: actionOutputsSchema(),
    attached: joi
      .boolean()
      .description(
        "Set to true if the action handler is running a process persistently and attached to the Garden process after returning."
      ),
  }),
})

/**
 * Maps a RunResult to the state field on ActionStatus, returned by several action handler types.
 */
export function runResultToActionState(result: RunResult) {
  if (result.success) {
    return "ready"
  } else {
    return "failed"
  }
}

export interface ActionDescription {
  compatibleTypes: string[]
  config: BaseActionConfig<any>
  configVersion: string
  group: string | undefined
  key: string
  kind: ActionKind
  longDescription: string
  moduleName: string | null
  name: string
  treeVersion: TreeVersion
  version: ActionVersion
}


export type ActionFile = {
  // relative path from the actions base or build path.
  relativePath: string
  source: "vcs" | "dependency"
  // absolute path on this computer.
  // If source === "vcs", then it's the absolute path to the file in the VCS.
  // If source === "dependency", then it's the absolute path to the file in the build folder the action we depend on.
  absolutePath: string
}

export interface ActionVersion {
  versionString: string
  dependencyVersions: DependencyVersions
  configVersion: string
  sourceVersion: string
  files: ActionFile[]
}

export abstract class BaseAction<
  C extends BaseActionConfig = BaseActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> {
  // TODO: figure out why kind and type come out as any types on Action type
  public readonly kind: C["kind"]
  public readonly type: C["type"]
  public readonly name: string
  public readonly uid: string

  protected resolved: boolean
  protected executed: boolean

  // Note: These need to be public because we need to reference the types (a current TS limitation)
  // We do however also use `_staticOutputs` so that one isn't just for types
  _config: C
  abstract _staticOutputs: StaticOutputs
  // This property is only used for types.
  // In theory it would be easy to replace it with a type that uses `infer` on BaseAction to grab the correct type
  // However, TS will sometimes erase unused types and since `RuntimeOutputs` is only used here to store the type
  // we cannot remove the property without breaking things.
  // Thus we simply initialize it to `{}` and use it as a type.
  _runtimeOutputs: RuntimeOutputs = {} as RuntimeOutputs

  protected readonly baseBuildDirectory: string
  protected readonly compatibleTypes: string[]
  protected readonly dependencies: ActionDependency[]
  protected readonly graph: ConfigGraph
  protected readonly linkedSource: LinkedSource | null
  protected readonly remoteSourcePath: string | null
  protected readonly _moduleName?: string // TODO: remove in 0.14
  protected readonly _moduleVersion?: ModuleVersion // TODO: remove in 0.14
  protected readonly _mode: ActionMode
  protected readonly projectRoot: string
  protected readonly _supportedModes: ActionModes
  protected readonly _treeVersion: TreeVersion
  protected readonly variables: DeepPrimitiveMap

  constructor(protected readonly params: ActionWrapperParams<C>) {
    this.kind = params.config.kind
    this.type = params.config.type
    this.name = params.config.name
    this.uid = params.uid
    this.baseBuildDirectory = params.baseBuildDirectory
    this.compatibleTypes = params.compatibleTypes
    this.dependencies = params.dependencies
    this.graph = params.graph
    this.linkedSource = params.linkedSource
    this.remoteSourcePath = params.remoteSourcePath
    this._moduleName = params.moduleName
    this._moduleVersion = params.moduleVersion
    this._mode = params.mode
    this._config = params.config
    this.projectRoot = params.projectRoot
    this._supportedModes = params.supportedModes
    this._treeVersion = params.treeVersion
    this.variables = params.variables
    this.resolved = false
    this.executed = false
  }

  abstract getBuildPath(): string

  isResolved(): this is ResolvedAction {
    return this.resolved
  }

  isExecuted(): this is ExecutedAction {
    return this.executed
  }

  reference(): ActionReference {
    return { kind: <ActionKind>this.kind, name: this.name }
  }

  key(): string {
    return actionReferenceToString(this)
  }

  /**
   * Verbose string description of the action. Useful for logging and error messages.
   */
  longDescription(): string {
    let d = `${chalk.white(this.kind)} type=${chalk.bold.white(this.type)} name=${chalk.bold.white(this.name)}`

    if (this._moduleName) {
      d += ` (from module ${chalk.bold.white(this._moduleName)})`
    }

    return d
  }

  isDisabled(): boolean {
    // TODO: return true if group is disabled
    // TODO: implement environments field on action config
    return actionIsDisabled(this._config, "TODO")
  }

  /**
   * Check if the action is linked, including those within an external project source.
   */
  isLinked(linkedSources: LinkedSource[]): boolean {
    if (this.hasRemoteSource() && !!this.linkedSource) {
      // Action is linked directly
      return true
    }

    const path = this.basePath()

    for (const source of linkedSources) {
      if (path === source.path || pathIsInside(path, source.path)) {
        // Action is in a project source
        return true
      }
    }

    return false
  }

  hasRemoteSource() {
    return !!this._config.source?.repository?.url
  }

  groupName() {
    const internal = this.getConfig("internal")
    return internal?.groupName
  }

  // TODO: rename to sourcePath
  basePath(): string {
    const basePath = this.remoteSourcePath || this._config.internal.basePath
    const sourceRelPath = this._config.source?.path

    if (sourceRelPath) {
      // TODO: validate that this is a directory here?
      return joinWithPosix(basePath, sourceRelPath)
    } else {
      return basePath
    }
  }

  configPath() {
    return this._config.internal.configFilePath
  }

  moduleName(): string | null {
    return this._moduleName || null
  }

  moduleVersion(): ModuleVersion {
    if (this._moduleVersion) {
      return this._moduleVersion
    } else {
      const version = this.getFullVersion()
      return {
        contentHash: version.sourceVersion,
        versionString: version.versionString,
        dependencyVersions: version.dependencyVersions,
        // TODO: is this what we want?
        files: this.getFilesFromSource().map((f) => f.absolutePath),
      }
    }
  }

  getDependencyReferences(): ActionDependency[] {
    return this.dependencies
  }

  getDependencies(opts?: GetActionOpts): Action[] {
    return this.dependencies.map((d) => this.graph.getActionByRef(d, opts))
  }

  hasDependency(refOrString: string | ActionReference) {
    const ref = isString(refOrString) ? parseActionReference(refOrString) : refOrString

    for (const dep of this.dependencies) {
      if (actionRefMatches(dep, ref)) {
        return true
      }
    }

    return false
  }

  getDependency<K extends ActionKind>(ref: ActionReference<K>, opts?: GetActionOpts) {
    for (const dep of this.dependencies) {
      if (actionRefMatches(dep, ref)) {
        return <PickTypeByKind<K, BuildAction, DeployAction, RunAction, TestAction>>this.graph.getActionByRef(ref, opts)
      }
    }

    return null
  }

  addDependency(dep: ActionDependency) {
    addActionDependency(dep, this.dependencies)
  }

  // Note: Making this name verbose so that people don't accidentally use this instead of versionString()
  @Memoize()
  getFullVersion(): ActionVersion {
    const depPairs: string[][] = []
    this.dependencies.forEach((d) => {
      const action = this.graph.getActionByRef(d, { includeDisabled: true })
      if (!action.isDisabled()) {
        depPairs.push([action.key(), action.versionString()])
      }
    })
    const sortedDeps = sortBy(depPairs, (pair) => pair[0])
    const dependencyVersions = fromPairs(depPairs)

    const configVersion = this.configVersion()
    const versionString =
      versionStringPrefix + hashStrings([configVersion, this._treeVersion.contentHash, ...flatten(sortedDeps)])

    return {
      configVersion,
      sourceVersion: this._treeVersion.contentHash,
      versionString,
      dependencyVersions,
      files: this.getFiles()
    }
  }

  @Memoize()
  getFiles(): ActionFile[] {
    return [
      ...this.getFilesFromDependencies(),
      ...this.getFilesFromSource()
    ].flat()
  }

  @Memoize()
  getFilesFromSource(): ActionFile[] {
    return this._treeVersion.files.map((absolutePath) => ({
      relativePath: normalizeRelativePath(this.basePath(), absolutePath),
      source: "vcs",
      absolutePath,
    }))
  }

  @Memoize()
  getFilesFromDependencies(): ActionFile[] {
    // Needs to be overridden in the BuildAction
    return []
  }

  treeVersion() {
    return this._treeVersion
  }

  @Memoize()
  private stringifyConfig() {
    return stableStringify(omit(this._config, "internal"))
  }

  /**
   * The version of this action's config (not including files or dependencies)
   */
  @Memoize()
  configVersion() {
    return versionStringPrefix + hashStrings([this.stringifyConfig()])
  }

  /**
   * Returns a map of commonly used environment variables for the action.
   */
  getEnvVars() {
    const GARDEN_ACTION_VERSION = this.versionString()

    return {
      GARDEN_ACTION_VERSION,
      // Note: Users will generally want the action version, not the module version here, but we
      // leave the old env var name in for backwards compatibility
      GARDEN_MODULE_VERSION: GARDEN_ACTION_VERSION,
    }
  }

  getVariables(): DeepPrimitiveMap {
    return this.variables
  }

  versionString(): string {
    return this.getFullVersion().versionString
  }

  getInternal(): BaseActionConfig["internal"] {
    return { ...this.getConfig("internal") }
  }

  getConfig(): C
  getConfig<K extends keyof C>(key: K): C[K]
  getConfig(key?: keyof C["spec"]) {
    return cloneDeep(key ? this._config[key] : this._config)
  }

  /**
   * Returns true if this action is compatible with the given action type.
   */
  isCompatible(type: string) {
    return this.compatibleTypes.includes(type)
  }

  /**
   * Returns true if this action matches the given action reference.
   */
  matchesRef(ref: ActionReference) {
    return actionRefMatches(ref, this)
  }

  /**
   * Return the mode that the action should be executed in.
   * Returns "default" if the action is not configured for the mode or the type does not support it.
   *
   * Note: A warning is emitted during action resolution if an unsupported mode is explicitly requested for it.
   */
  mode(): ActionMode {
    return this.supportsMode(this._mode) ? this._mode : "default"
  }

  supportsMode(mode: ActionMode) {
    return mode === "default" || !!this._supportedModes[mode]
  }

  describe(): ActionDescription {
    return {
      compatibleTypes: this.compatibleTypes,
      config: this.getConfig(),
      configVersion: this.configVersion(),
      group: this.groupName(),
      key: this.key(),
      kind: this.kind,
      longDescription: this.longDescription(),
      moduleName: this.moduleName(),
      name: this.name,
      treeVersion: this.treeVersion(),
      version: this.getFullVersion(),
    }
  }

  /**
   * Creates an ActionLog instance with this action as the log context.
   * Mainly used as a convenience during testing.
   */
  createLog(log: Log) {
    return createActionLog({
      log,
      actionKind: this.kind,
      actionName: this.name,
    })
  }
}

export abstract class RuntimeAction<
  C extends BaseRuntimeActionConfig = BaseRuntimeActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> extends BaseAction<C, StaticOutputs, RuntimeOutputs> {
  /**
   * Return the Build action specified on the `build` field if defined, otherwise null
   */
  getBuildAction<T extends BuildAction>() {
    const buildName = this.getConfig("build")
    if (buildName) {
      const buildAction = this.graph.getBuild(buildName, { includeDisabled: true })
      return <T>buildAction
    } else {
      return null
    }
  }

  /**
   * Get the build path for the action. For runtime actions, if a `build` is set on the action, we return the build
   * path of the referenced action. Otherwise the base path of the action is used (since no build is involved).
   */
  getBuildPath() {
    const buildAction = this.getBuildAction()
    return buildAction?.getBuildPath() || this.basePath()
  }
}

// Used to ensure compatibility between ResolvedBuildAction and ResolvedRuntimeAction
// FIXME: Might be possible to remove in a later TypeScript version or through some hacks.
export interface ResolvedActionExtension<
  C extends BaseRuntimeActionConfig = BaseRuntimeActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> {
  getDependencyResult(ref: ActionReference | Action): GraphResult | null

  getExecutedDependencies(): ExecutedAction[]

  getResolvedDependencies(): ResolvedAction[]

  getSpec(): C["spec"]

  getSpec<K extends keyof C["spec"]>(key: K): C["spec"][K]

  getOutput<K extends keyof StaticOutputs>(key: K): GetOutputValueType<K, StaticOutputs, RuntimeOutputs>

  getOutputs(): StaticOutputs

  getVariables(): DeepPrimitiveMap
}

// TODO: see if we can avoid the duplication here with ResolvedBuildAction
export abstract class ResolvedRuntimeAction<
    Config extends BaseRuntimeActionConfig = BaseRuntimeActionConfig,
    StaticOutputs extends {} = any,
    RuntimeOutputs extends {} = any,
  >
  extends RuntimeAction<Config, StaticOutputs, RuntimeOutputs>
  implements ResolvedActionExtension<Config, StaticOutputs, RuntimeOutputs>
{
  protected override graph: ResolvedConfigGraph
  protected override readonly params: ResolvedActionWrapperParams<Config>
  protected override readonly resolved: true
  private readonly dependencyResults: GraphResults
  private readonly executedDependencies: ExecutedAction[]
  private readonly resolvedDependencies: ResolvedAction[]

  override _staticOutputs: StaticOutputs

  constructor(params: ResolvedActionWrapperParams<Config>) {
    super(params)

    this.params = params
    this.resolved = true
    this.graph = params.resolvedGraph
    this.dependencyResults = params.dependencyResults
    this.executedDependencies = params.executedDependencies
    this.resolvedDependencies = params.resolvedDependencies
    this._staticOutputs = params.staticOutputs
    this._config.spec = params.spec
    this._config.internal.inputs = params.inputs
  }

  /**
   * Return the resolved Build action specified on the `build` field if defined, otherwise null
   */
  getResolvedBuildAction<T extends ResolvedBuildAction>() {
    const buildName = this.getConfig("build")
    if (buildName) {
      const buildAction = this.getResolvedDependencies().find((a) => a.kind === "Build" && a.name === buildName)

      if (!buildAction) {
        throw new InternalError({
          message: `Could not find build dependency '${buildName}' specified on the build field on ${this.longDescription()}.`,
        })
      }

      return <T>buildAction
    } else {
      return null
    }
  }

  getExecutedDependencies() {
    return this.executedDependencies
  }

  getResolvedDependencies(): ResolvedAction[] {
    return [...this.resolvedDependencies, ...this.executedDependencies]
  }

  getDependencyResult(ref: ActionReference | Action): GraphResult | null {
    return this.dependencyResults[actionReferenceToString(ref)] || null
  }

  // TODO: allow nested key lookups here
  getSpec(): Config["spec"]
  getSpec<K extends keyof Config["spec"]>(key: K): Config["spec"][K]
  getSpec(key?: keyof Config["spec"]) {
    return cloneDeep(key ? this._config.spec[key] : this._config.spec)
  }

  getOutput<K extends keyof StaticOutputs>(key: K): GetOutputValueType<K, StaticOutputs, RuntimeOutputs> {
    return <any>this._staticOutputs[<keyof StaticOutputs>key]
  }

  getOutputs() {
    return this._staticOutputs
  }
}

export interface ExecutedActionExtension<
  _ extends BaseRuntimeActionConfig = BaseRuntimeActionConfig,
  StaticOutputs extends {} = any,
  RuntimeOutputs extends {} = any,
> {
  getOutput<K extends keyof (StaticOutputs & RuntimeOutputs)>(
    key: K
  ): GetOutputValueType<K, StaticOutputs, RuntimeOutputs>
  getOutputs(): StaticOutputs & RuntimeOutputs
}

// TODO: see if we can avoid the duplication here with ResolvedBuildAction
export abstract class ExecutedRuntimeAction<
    C extends BaseRuntimeActionConfig = BaseRuntimeActionConfig,
    StaticOutputs extends {} = any,
    RuntimeOutputs extends {} = any,
  >
  extends ResolvedRuntimeAction<C, StaticOutputs, RuntimeOutputs>
  implements ExecutedActionExtension<C, StaticOutputs, RuntimeOutputs>
{
  private readonly status: ActionStatus<this, any, RuntimeOutputs>

  constructor(params: ExecutedActionWrapperParams<C, StaticOutputs, RuntimeOutputs>) {
    super(params)
    this.status = params.status
  }

  getStatus() {
    return this.status
  }

  override getOutput<K extends keyof (StaticOutputs & RuntimeOutputs)>(
    key: K
  ): GetOutputValueType<K, StaticOutputs, RuntimeOutputs> {
    // FIXME: unsure how to avoid the any cast here, but usage is unaffected
    return <any>(this.status.outputs[<keyof RuntimeOutputs>key] || this._staticOutputs[<keyof StaticOutputs>key])
  }

  override getOutputs() {
    return { ...this._staticOutputs, ...this.status.outputs }
  }
}

export function actionReferenceToString(ref: ActionReference | string) {
  if (isString(ref)) {
    return ref
  } else {
    return `${ref.kind.toLowerCase()}.${ref.name}`
  }
}

export function actionReferencesToMap(refs: ActionReference[]) {
  const out: ActionReferenceMap = {
    Build: [],
    Deploy: [],
    Run: [],
    Test: [],
  }

  for (const ref of refs) {
    out[ref.kind].push(ref.name)
  }

  return out
}

export function isActionConfig(config: any): config is BaseActionConfig {
  return actionKinds.includes(config.kind)
}

export function actionRefMatches(a: ActionReference, b: ActionReference) {
  return a.kind === b.kind && a.name === b.name
}

export function describeActionConfig(config: ActionConfig) {
  const d = `${config.type} ${config.kind} ${config.name}`
  if (config.internal?.moduleName) {
    return d + ` (from module ${config.internal?.moduleName})`
  } else if (config.internal?.groupName) {
    return d + ` (from group ${config.internal?.groupName})`
  } else {
    return d
  }
}

export function describeActionConfigWithPath(config: ActionConfig, rootPath: string) {
  const path = relative(rootPath, config.internal.configFilePath || config.internal.basePath)
  return `${describeActionConfig(config)} in ${path}`
}

/**
 * Adds or merges the given dependency into a list of dependencies.
 */
export function addActionDependency(dep: ActionDependency, dependencies: ActionDependency[]) {
  for (const d of dependencies) {
    if (actionRefMatches(d, dep)) {
      // Merge with existing dependency link. Basically a boolean OR on each attribute.
      for (const [key, value] of Object.entries(dep)) {
        if (value) {
          d[key] = value
        }
      }
      return
    }
  }
  dependencies.push(dep)
}

export function actionIsDisabled(config: ActionConfig, _environmentName: string): boolean {
  // TODO: implement environment fields and check if environment is disabled
  return config.disabled === true
}
