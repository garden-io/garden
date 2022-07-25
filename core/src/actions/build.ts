/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { ActionReference, includeGuideLink, joi, joiSparseArray, joiUserIdentifier } from "../config/common"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { ResolvedConfigGraph } from "../graph/config-graph"
import { GraphResult, GraphResults } from "../graph/solver"
import { dedent } from "../util/string"
import {
  BaseActionConfig,
  baseActionConfigSchema,
  BaseAction,
  includeExcludeSchema,
  ResolvedActionWrapperParams,
  Action,
  ActionStatus,
  actionReferenceToString,
  ResolvedActionExtension,
} from "./base"

export interface BuildCopyFrom {
  build: string
  sourcePath: string
  targetPath: string
}

export interface BuildActionConfig<N extends string = any, S extends object = any>
  extends BaseActionConfig<"Build", N, S> {
  type: N
  allowPublish?: boolean
  buildAtSource?: boolean
  copyFrom?: BuildCopyFrom[]
  timeout?: number
}

export const copyFromSchema = () =>
  joi.object().keys({
    build: joiUserIdentifier().required().description("The name of the Build action to copy from."),
    sourcePath: joi
      .posixPath()
      .allowGlobs()
      .subPathOnly()
      .required()
      .description(
        "POSIX-style path or filename of the directory or file(s) to copy to the target, relative to the build path of the source build."
      ),
    targetPath: joi.posixPath().subPathOnly().default("").description(dedent`
      POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
      Defaults to to same as source path.
    `),
  })

export const buildActionConfig = () =>
  baseActionConfigSchema().keys({
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

        You _can_ override this by setting \`buildAtSource: true\`, which basically sets the build root for this action at the location of the Build action config in the source tree. This means e.g. that the build command in \`exec\` Builds runs at the source, and for \`docker-image\` builds the build is initiated from the source directory.

        An important implication is that \`include\` and \`exclude\` directives for the action, as well as \`.gardenignore\` files, only affect version hash computation but are otherwise not effective in controlling the build context. This may lead to unexpected variation in builds with the same version hash. **This may also slow down code synchronization to remote destinations, e.g. when performing remote \`docker-image\` builds.**

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
      .description("Set a timeout for the build to complete, in seconds.")
      .meta({ templateContext: ActionConfigContext }),
  })

export class BuildAction<C extends BuildActionConfig = BuildActionConfig, O extends {} = any> extends BaseAction<C, O> {
  kind: "Build"

  /**
   * Returns the build path for the action. The path is generally `<project root>/.garden/build/<action name>`.
   * If `buildAtSource: true` is set on the config, the path is the base path of the action.
   */
  getBuildPath() {
    if (this._config.buildAtSource) {
      return this.basePath()
    } else {
      return join(this.baseBuildDirectory, this.name)
    }
  }

  // TODO-G2: see if we actually need/want this
  getBuildMetadataPath() {
    return join(this.baseBuildDirectory, this.name + ".metadata")
  }
}

// TODO: see if we can avoid the duplication here with ResolvedRuntimeAction
export abstract class ResolvedBuildAction<C extends BuildActionConfig = BuildActionConfig, O extends {} = any>
  extends BuildAction<C, O>
  implements ResolvedActionExtension<C, O> {
  private readonly dependencyResults: GraphResults
  private readonly resolvedGraph: ResolvedConfigGraph
  private readonly status: ActionStatus<this, any, O>

  constructor(params: ResolvedActionWrapperParams<C, O>) {
    super(params)
    this.dependencyResults = params.dependencyResults
    this.resolvedGraph = params.resolvedGraph
    this.status = params.status
  }

  getResolvedDependencies() {
    return this.dependencies.map((d) => this.resolvedGraph.getActionByRef(d))
  }

  getDependencyResult(ref: ActionReference | Action): GraphResult | null {
    return this.dependencyResults[actionReferenceToString(ref)] || null
  }

  getOutput<K extends keyof O>(key: K) {
    return this.status.outputs[key]
  }

  getOutputs() {
    return this.status.outputs
  }

  getVariables() {
    return this.variables
  }
}

export function isBuildAction(action: Action): action is BuildAction {
  return action.kind === "build"
}
