/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import titleize from "titleize"
import {
  apiVersionSchema,
  DeepPrimitiveMap,
  includeGuideLink,
  joi,
  joiIdentifier,
  joiUserIdentifier,
  joiVariables,
} from "../config/common"
import { varfileDescription } from "../config/project"
import { dedent, naturalList } from "../util/string"

export type ActionKind = "build" | "deploy" | "run" | "test"
export const actionKinds = ["build", "deploy", "run", "test"]

export interface BaseActionSpec {
  // Basics
  apiVersion?: string
  kind: string
  type: string
  name: string
  description?: string

  // Location/metadata
  path?: string

  // Controls
  disabled?: boolean

  // Version/file handling
  include?: string[]
  exclude?: string[]

  // Variables
  variables?: DeepPrimitiveMap
  varfile?: string
}

export const includeExcludeSchema = () => joi.array().items(joi.posixPath().allowGlobs().subPathOnly())

export const baseActionSpec = () =>
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

    // Controls
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        Set this to \`true\` to disable the action. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

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
      A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving the action.
    `),
    varfile: joi
      .posixPath()
      .description(
        dedent`
          Specify a path (relative to the module root) to a file containing variables, that we apply on top of the action-level \`variables\` field.

          ${varfileDescription}

          To use different action-level varfiles in different environments, you can template in the environment name to the varfile name, e.g. \`varfile: "my-action.\$\{environment.name\}.env\` (this assumes that the corresponding varfiles exist).
        `
      )
      .example("my-action.env"),
  })

export interface BaseRuntimeActionSpec extends BaseActionSpec {
  build?: string
}

export const baseRuntimeActionSpec = () =>
  baseActionSpec().keys({
    build: joiUserIdentifier().description(
      dedent(
        `Specify a _Build_ action, and resolve this action from the context of that Build.

        For example, you might create an \`exec\` Build which prepares some manifests, and then reference that in a \`kubernetes\` _Deploy_ action, and the resulting manifests from the Build.

        This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced \`exec\` Build would be the source.
        `
      )
    ),
  })

export class BaseActionWrapper<S extends BaseActionSpec> {
  constructor(private spec: S) {}

  async getConfig(key: keyof S) {
    return this.spec[key]
  }
}
