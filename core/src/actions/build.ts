/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getSchemaDescription, includeGuideLink, joi, joiRepositoryUrl, joiSparseArray } from "../config/common"
import { generatedFileSchema, GenerateFileSpec } from "../config/module"
import { dedent } from "../util/string"
import { BaseActionSpec, baseActionSpec, BaseActionWrapper, includeExcludeSchema } from "./base"

export interface BuildActionSpec extends BaseActionSpec {
  kind: "Build"
  allowPublish?: boolean
  generateFiles?: GenerateFileSpec[]
  repositoryUrl?: string
}

export const buildActionSpec = () =>
  baseActionSpec().keys({
    allowPublish: joi
      .boolean()
      .default(true)
      .description("When false, disables publishing this module to remote registries via the publish command."),

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

    generateFiles: joiSparseArray(generatedFileSchema()).description(dedent`
      A list of files to write to the action source directory when resolving this action. This is useful to automatically generate (and template) any supporting files needed for the build.

      **Note that in a future version, this may be limited to only generating files in the _build directory_, and not the action's source directory.**
    `),

    repositoryUrl: joiRepositoryUrl().description(
      dedent`
      ${getSchemaDescription(joiRepositoryUrl())}

      When set, Garden will import the build context from this repository, but use this action configuration (and not scan for configs in the separate repository).`
    ),
  })

export class BuildActionWrapper<S extends BaseActionSpec> extends BaseActionWrapper<S> {}
