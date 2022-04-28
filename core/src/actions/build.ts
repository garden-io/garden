/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includeGuideLink, joi, joiSparseArray, joiUserIdentifier } from "../config/common"
import { dedent } from "../util/string"
import { BaseActionConfig, baseActionConfig, Action, includeExcludeSchema } from "./base"

export interface BuildCopyFrom {
  build: string
  sourcePath: string
  targetPath: string
}

export interface BuildActionConfig<N extends string = any, S extends object = any> extends BaseActionConfig<S> {
  kind: "Build"
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
  baseActionConfig().keys({
    allowPublish: joi
      .boolean()
      .default(true)
      .description("When false, disables publishing this build to remote registries via the publish command."),

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
      ),

    copyFrom: joiSparseArray(copyFromSchema()).description(
      dedent`
        Copy files from other builds, ahead of running this build.
      `
    ),

    include: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and will affect the computed _version_ of the action.

        If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an \`ADD .\` statement) so it may be important to set \`include\` and/or \`exclude\` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

        You can _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.`
      )
      .example(["my-app.js", "some-assets/**/*"]),
    exclude: includeExcludeSchema()
      .description(
        dedent`
        Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the build context and the Build version.

        Providers are sometimes able to infer the \`include\` field, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an \`ADD .\` statement) so it may be important to set \`include\` and/or \`exclude\` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

        Unlike the \`scan.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project \`scan.exclude\` field to affect those, if you have large directories that should not be watched for changes.
        `
      )
      .example(["tmp/**/*", "*.log"]),

    timeout: joi.number().integer().description("Set a timeout for the build to complete, in seconds."),
  })

export class BuildAction<C extends BuildActionConfig> extends Action<C> {}
