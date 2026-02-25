/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import type { BaseGardenResource } from "./base.js"
import { baseInternalFieldsSchema } from "./base.js"
import type { DeepPrimitiveMap, PrimitiveMap, StringMap } from "./common.js"
import {
  joi,
  joiArray,
  joiEnvVars,
  joiIdentifier,
  joiSparseArray,
  joiUserIdentifier,
  joiVariables,
  createSchema,
  unusedApiVersionSchema,
} from "./common.js"
import { dedent } from "../util/string.js"
import { DOCS_BASE_URL } from "../constants.js"
import type { StepModifier } from "../commands/helpers/steps.js"

interface BaseParameter {
  name: string
  description: string
  required?: boolean
}

export interface CustomCommandArgument extends BaseParameter {
  type: "string" | "integer"
}

export interface CustomCommandOption extends BaseParameter {
  type: CustomCommandArgument["type"] | "boolean"
}

export interface CommandStepSpec {
  name?: string
  description?: string
  gardenCommand?: string[]
  exec?: {
    command: string[]
    env?: StringMap
  }
  script?: string
  envVars?: PrimitiveMap
  when?: StepModifier
  skip?: boolean
  continueOnError?: boolean
}

export interface CommandResource extends BaseGardenResource {
  description: {
    short: string
    long?: string
  }

  args: CustomCommandArgument[]
  opts: CustomCommandOption[]

  exec?: {
    command: string[]
    env?: StringMap
  }
  gardenCommand?: string[]
  steps?: CommandStepSpec[]

  variables: DeepPrimitiveMap
}

const argumentSchema = createSchema({
  name: "custom-command-arguments",
  keys: () => ({
    name: joiIdentifier().required().description("Short name for the parameter."),
    description: joi.string().required().description("Help text to describe the parameter."),
    type: joi
      .string()
      .only()
      .allow("string", "integer", "boolean")
      .default("string")
      .description("The value type, to use for validation."),
    required: joi.boolean().default(false).description("Whether the parameter is required."),
  }),
})

const customCommandExecDescription =
  "A command to run. If both this and `gardenCommand` are specified, this command is run ahead of the Garden command."

export const customCommandExecSchema = createSchema({
  name: "custom-command-exec",
  description: customCommandExecDescription,
  keys: () => ({
    command: joi
      .array()
      .items(joi.string())
      .required()
      .description(
        'The command to run. The first part of the array should be an executable available on a global PATH or a relative path to an executable. To run a shell script, you need to specify the shell as part of the command, e.g. `["sh", "-c", "<your sript>"]` or `["bash", "-s", "<your sript>"]`'
      )
      .example(["sh", "-c", "echo foo"]),
    env: joiEnvVars().description("Environment variables to set when running the command."),
  }),
})

const customCommandGardenCommandDescription = dedent`
  Run the specified Garden command. If both this and \`exec\` are specified, the script is run ahead of this command.
`

export const customCommandGardenCommandSchema = memoize(() =>
  joi.array().items(joi.string()).description(customCommandGardenCommandDescription)
)

export const commandStepSchema = createSchema({
  name: "command-step",
  description: "A step in a custom Command. Must specify exactly one of `gardenCommand`, `exec`, or `script`.",
  keys: () => ({
    name: joiIdentifier().description(dedent`
      An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
      <number of step> is the sequential number of the step (first step being number 1).

      This identifier is useful when referencing step outputs in following steps. For example, if you set this
      to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in template strings.
    `),
    gardenCommand: joi
      .sparseArray()
      .items(joi.string())
      .description(
        dedent`
        A Garden command this step should run, followed by any required or optional arguments and flags.

        Global options like --env, --log-level etc. are currently not supported for built-in commands,
        since they are handled before the individual steps are run.
        `
      )
      .example(["deploy", "my-service"]),
    exec: customCommandExecSchema().description("An external command to run as part of this step."),
    script: joi.string().description(
      dedent`
      A bash script to run. Note that the host running the command must have bash installed and on path.
      It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error,
      and the remainder of the steps is aborted.

      The script may include template strings, including references to previous steps.
      `
    ),
    description: joi.string().description("A description of the step."),
    envVars: joiEnvVars().description(dedent`
      A map of environment variables to use when running script steps. Ignored for \`gardenCommand\` steps.
    `),
    skip: joi
      .boolean()
      .default(false)
      .description(
        `Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or scenarios.`
      )
      .example("${environment.name != 'prod'}"),
    when: joi.string().allow("onSuccess", "onError", "always", "never").default("onSuccess").description(dedent`
      If used, this step will be run under the following conditions (may use template strings):

      \`onSuccess\` (default): This step will be run if all preceding steps succeeded or were skipped.

      \`onError\`: This step will be run if a preceding step failed, or if its preceding step has \`when: onError\`.
      If the next step has \`when: onError\`, it will also be run. Otherwise, all subsequent steps are ignored.

      \`always\`: This step will always be run, regardless of whether any preceding steps have failed.

      \`never\`: This step will always be ignored.

      See the [workflows guide](${DOCS_BASE_URL}/features/workflows#the-skip-and-when-options) for details
      and examples.
      `),
    continueOnError: joi.boolean().description(`Set to true to continue if the step errors.`).default(false),
  }),
  xor: [["gardenCommand", "exec", "script"]],
})

export const customCommandSchema = createSchema({
  name: "custom-command",
  keys: () => ({
    apiVersion: unusedApiVersionSchema(),
    kind: joi.string().default("Command").valid("Command").description("Indicate what kind of config this is."),
    name: joiUserIdentifier()
      .required()
      .description(
        "The name of the command. Must be a valid DNS identifier, i.e. a kebab-cased string with no spaces."
      ),
    description: joi
      .object()
      .keys({
        short: joi.string().required().max(100).description("A short help text, shown with `garden help`."),
        long: joi
          .string()
          .description(
            "A longer help text, printed when you run the command with the `--help` flag. If it's not provided, the short text is used."
          ),
      })
      .required()
      .description("The help text description for the command."),

    internal: baseInternalFieldsSchema,

    args: joiArray(argumentSchema())
      .description(
        "A list of positional arguments that the command should expect. These can be referenced in the `script` and `gardenCommand` fields with `${args.<name>}`. They are parsed in the order given.\n\nNote that you can skip this if you just want to pass all arguments to the script or the Garden command with e.g. `${join(args.$all, ' ')}` or `${args.$all[0]}`. **Note that you cannot use templating in these argument specs themselves.**"
      )
      .unique("name"),
    opts: joiArray(argumentSchema())
      .description(
        "A list of option flags that the command should expect. These can be referenced in the `script` and `gardenCommand` fields with `${opts.<name>}`. **Note that you cannot use templating in these option specs themselves.**"
      )
      .unique("name"),
    exec: customCommandExecSchema().description(dedent`
      [DEPRECATED] Use \`steps\` instead.

      ${customCommandExecDescription}
    `),
    gardenCommand: customCommandGardenCommandSchema().description(dedent`
      [DEPRECATED] Use \`steps\` instead.

      ${customCommandGardenCommandDescription}
    `),
    steps: joiSparseArray(commandStepSchema()).description(dedent`
      A sequence of steps to run when the command is invoked. Steps are run sequentially.
      If a step fails, subsequent steps are skipped (unless they have \`when: onError\` or \`when: always\`).

      Each step must specify exactly one of \`gardenCommand\`, \`exec\`, or \`script\`.

      Steps may reference outputs from previous steps using template strings, e.g. \${steps.my-step.outputs.*}.
    `),
    variables: joiVariables().description(
      "A map of variables that can be referenced in `exec`, `gardenCommand`, and `steps`."
    ),
  }),
  or: [["exec", "gardenCommand", "steps"]],
  // Don't allow both steps and exec/gardenCommand to be specified
  oxor: [
    ["steps", "gardenCommand"],
    ["steps", "exec"],
  ],
})
