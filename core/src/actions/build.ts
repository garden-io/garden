/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import type { ActionReference } from "../config/common.js"
import { createSchema, includeGuideLink, joi, joiSparseArray, joiUserIdentifier } from "../config/common.js"
import { ActionConfigContext } from "../config/template-contexts/actions.js"
import type { GraphResult, GraphResults } from "../graph/results.js"
import { dedent } from "../util/string.js"
import type {
  BaseActionConfig,
  ResolvedActionWrapperParams,
  Action,
  ActionStatus,
  ExecutedActionWrapperParams,
  ExecutedAction,
  ResolvedAction,
  GetOutputValueType,
} from "./types.js"
import type { ResolvedActionExtension, ExecutedActionExtension } from "./base.js"
import { baseActionConfigSchema, BaseAction, includeExcludeSchema, actionReferenceToString } from "./base.js"
import type { ResolvedConfigGraph } from "../graph/config-graph.js"
import type { ActionVersion } from "../vcs/vcs.js"
import { Memoize } from "typescript-memoize"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../constants.js"
import { createBuildTask } from "../tasks/build.js"
import type { BaseActionTaskParams, ExecuteTask } from "../tasks/base.js"
import { ResolveActionTask } from "../tasks/resolve-action.js"
import type { ResolvedTemplate } from "../template/types.js"
import type { Log } from "../logger/log-entry.js"
import { ACTION_RUNTIME_LOCAL, type ActionRuntime } from "../plugin/base.js"

export interface BuildCopyFrom {
  build: string
  sourcePath: string
  targetPath: string
}

export interface BuildActionConfig<T extends string = string, S extends object = any>
  extends BaseActionConfig<"Build", T, S> {
  type: T
  allowPublish?: boolean
  buildAtSource?: boolean
  copyFrom?: BuildCopyFrom[]
}

export const copyFromSchema = createSchema({
  name: "build-copyFrom",
  keys: () => ({
    build: joiUserIdentifier().required().description("The name of the Build action to copy from."),
    sourcePath: joi
      .posixPath()
      .allowGlobs()
      .subPathOnly()
      .required()
      .description(
        "POSIX-style path or filename of the directory or file(s) to copy to the target, relative to the build path of the source build."
      ),
    targetPath: joi
      .posixPath()
      .subPathOnly()
      .default((parent) => parent.sourcePath).description(dedent`
      POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
      Defaults to to same as source path.
    `),
  }),
})

export const buildActionConfigSchema = createSchema({
  name: "build-action-config",
  extend: baseActionConfigSchema,
  keys: () => ({
    kind: joi.string().allow("Build").only(),

    allowPublish: joi
      .boolean()
      .default(true)
      .description("When false, disables publishing this build to remote registries via the publish command.")
      .meta({ templateContext: ActionConfigContext }),

    buildAtSource: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        By default, builds are _staged_ in \`.garden/build/<build name>\` and that directory is used as the build context. This is done to avoid builds contaminating the source tree, which can end up confusing version computation, or a build including files that are not intended to be part of it. In most scenarios, the default behavior is desired and leads to the most predictable and verifiable builds, as well as avoiding potential confusion around file watching.

        You _can_ override this by setting \`buildAtSource: true\`, which basically sets the build root for this action at the location of the Build action config in the source tree. This means e.g. that the build command in \`exec\` Builds runs at the source, and for Docker image builds the build is initiated from the source directory.

        An important implication is that \`include\` and \`exclude\` directives for the action, as well as \`.gardenignore\` files, only affect version hash computation but are otherwise not effective in controlling the build context. This may lead to unexpected variation in builds with the same version hash. **This may also slow down code synchronization to remote destinations, e.g. when performing remote Docker image builds.**

        Additionally, any \`exec\` runtime actions (and potentially others) that reference this Build with the \`build\` field, will run from the source directory of this action.

        While there may be good reasons to do this in some situations, please be aware that this increases the potential for side-effects and variability in builds. **You must take extra care**, including making sure that files generated during builds are excluded with e.g. \`.gardenignore\` files or \`exclude\` fields on potentially affected actions. Another potential issue is causing infinite loops when running with file-watching enabled, basically triggering a new build during the build.
        `
      )
      .meta({ templateContext: ActionConfigContext }),

    copyFrom: joiSparseArray(copyFromSchema())
      .description(
        dedent`
        Copy files from other builds, ahead of running this build.
      `
      )
      .meta({ templateContext: ActionConfigContext }),

    include: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and will affect the computed _version_ of the action.

        If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an \`ADD .\` statement) so it may be important to set \`include\` and/or \`exclude\` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

        You can _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.`
      )
      .example(["my-app.js", "some-assets/**/*"])
      .meta({ templateContext: ActionConfigContext }),
    exclude: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the build context and the Build version.

        Providers are sometimes able to infer the \`include\` field, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an \`ADD .\` statement) so it may be important to set \`include\` and/or \`exclude\` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

        Unlike the \`scan.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project \`scan.exclude\` field to affect those, if you have large directories that should not be watched for changes.
        `
      )
      .example(["tmp/**/*", "*.log"])
      .meta({ templateContext: ActionConfigContext }),

    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_BUILD_TIMEOUT_SEC)
      .description("Set a timeout for the build to complete, in seconds.")
      .meta({ templateContext: ActionConfigContext }),
  }),
})

export class BuildAction<
  C extends BuildActionConfig<any, any> = BuildActionConfig<any, any>,
  StaticOutputs extends Record<string, unknown> = any,
  RuntimeOutputs extends Record<string, unknown> = any,
> extends BaseAction<C, StaticOutputs, RuntimeOutputs> {
  override kind = "Build" as const
  // TODO:
  // `_staticOutputs` is abstract since the base class uses it but doesn't define it in the constructor.
  // In this case this would also be the case, but the class isn't actually abstract so it needs it to be defined.
  // We initialize it to `{}` here which is a hack, but otherwise we'd need to also turn this class into an abstract class.
  override _staticOutputs: StaticOutputs = {} as StaticOutputs

  /**
   * Builds from module conversions inherit their version from their parent module. This is done for compatibility
   * reasons, so that e.g. the module version hash that appears in `${modules.*.outputs.deployment-image-id}` in
   * a runtime step in a module config is consistent with the version hash in the image tag pushed by the `container`
   * build. Otherwise, this would fail, since the Build version would differ from the module version.
   *
   * Semantically, this should be irrelevant to the user, since build cache hits or misses should be triggered for
   * similar changes to the underlying build-relevant parts of the module config, or to the included sources.
   */
  @Memoize(() => true)
  override getFullVersion(log: Log): ActionVersion {
    const actionVersion = super.getFullVersion(log)
    if (this._moduleVersion) {
      actionVersion.versionString = this.moduleVersion(log).versionString
    }
    return actionVersion
  }

  /**
   * Returns the build path for the action. The path is generally `<project root>/.garden/build/<action name>`.
   * If `buildAtSource: true` is set on the config, the path is the base path of the action.
   */
  getBuildPath() {
    if (this._config.buildAtSource) {
      return this.sourcePath()
    } else {
      return join(this.baseBuildDirectory, this.name)
    }
  }

  override getExecuteTask(baseParams: Omit<BaseActionTaskParams, "action">): ExecuteTask {
    return createBuildTask({ ...baseParams, action: this })
  }

  getResolveTask(baseParams: Omit<BaseActionTaskParams, "action">): ResolveActionTask<typeof this> {
    return new ResolveActionTask({ ...baseParams, action: this })
  }
}

// TODO: see if we can avoid the duplication here with ResolvedRuntimeAction
export class ResolvedBuildAction<
    C extends BuildActionConfig<any, any> = BuildActionConfig<any, any>,
    StaticOutputs extends Record<string, unknown> = any,
    RuntimeOutputs extends Record<string, unknown> = any,
  >
  extends BuildAction<C, StaticOutputs, RuntimeOutputs>
  implements ResolvedActionExtension<C, StaticOutputs, RuntimeOutputs>
{
  protected override graph: ResolvedConfigGraph
  protected override readonly params: ResolvedActionWrapperParams<C>
  protected override readonly resolved: true
  private readonly dependencyResults: GraphResults
  private readonly executedDependencies: ExecutedAction[]
  private readonly resolvedDependencies: ResolvedAction[]
  override _staticOutputs: StaticOutputs
  private _runtime: ActionRuntime

  constructor(params: ResolvedActionWrapperParams<C>) {
    super(params)
    this.params = params
    this.graph = params.resolvedGraph
    this.dependencyResults = params.dependencyResults
    this.executedDependencies = params.executedDependencies
    this.resolvedDependencies = params.resolvedDependencies
    this.resolved = true
    this._staticOutputs = params.staticOutputs
    this._config.spec = params.spec
    this._config.internal.inputs = params.inputs
    // This is the default. It may be overridden by a getOutputs plugin handler and assigned here by ResolveActionTask
    this._runtime = ACTION_RUNTIME_LOCAL
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
  getSpec(): C["spec"]
  getSpec<K extends keyof C["spec"]>(key: K): C["spec"][K]
  getSpec(key?: keyof C["spec"]) {
    return key ? this._config.spec[key] : this._config.spec
  }

  getOutput<K extends keyof StaticOutputs>(key: K): GetOutputValueType<K, StaticOutputs, RuntimeOutputs> {
    return <any>this._staticOutputs[<keyof StaticOutputs>key]
  }

  getOutputs() {
    return this._staticOutputs
  }

  getResolvedVariables(): Record<string, ResolvedTemplate> {
    return this.params.resolvedVariables
  }

  getRuntime(): ActionRuntime {
    return this._runtime
  }
}

export class ExecutedBuildAction<
    C extends BuildActionConfig<any, any> = BuildActionConfig<any, any>,
    StaticOutputs extends Record<string, unknown> = any,
    RuntimeOutputs extends Record<string, unknown> = any,
  >
  extends ResolvedBuildAction<C, StaticOutputs, RuntimeOutputs>
  implements ExecutedActionExtension<C, StaticOutputs, RuntimeOutputs>
{
  protected override readonly executed: true
  private readonly status: ActionStatus<this, any, RuntimeOutputs>

  constructor(params: ExecutedActionWrapperParams<C, StaticOutputs, RuntimeOutputs>) {
    super(params)
    this.status = params.status
    this.executed = true
  }

  override getOutput<K extends keyof (StaticOutputs & RuntimeOutputs)>(
    key: K
  ): GetOutputValueType<K, StaticOutputs, RuntimeOutputs> {
    // FIXME: unsure how to avoid the any cast here, but usage is unaffected
    return <any>(this.status.outputs[<any>key] || this._staticOutputs[<keyof StaticOutputs>key])
  }

  override getOutputs() {
    return { ...this._staticOutputs, ...this.status.outputs }
  }
}

export function isBuildAction(action: Action): action is BuildAction {
  return action.kind === "Build"
}

export function isBuildActionConfig(config: BaseActionConfig): config is BuildActionConfig {
  return config.kind === "Build"
}
