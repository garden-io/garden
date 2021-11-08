/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenResource } from "./base"
import {
  apiVersionSchema,
  DeepPrimitiveMap,
  joi,
  joiArray,
  joiEnvVars,
  joiIdentifier,
  joiUserIdentifier,
  joiVariables,
  StringMap,
} from "./common"

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

export interface CommandResource extends GardenResource {
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

  variables: DeepPrimitiveMap
}

const argumentSchema = () =>
  joi.object().keys({
    name: joiIdentifier().required().description("Short name for the parameter."),
    description: joi.string().required().description("Help text to describe the parameter."),
    type: joi
      .string()
      .only()
      .allow("string", "integer", "boolean")
      .default("string")
      .description("The value type, to use for validation."),
    required: joi.boolean().default(false).description("Whether the parameter is required."),
  })

export const customCommandExecSchema = () =>
  joi
    .object()
    .keys({
      command: joi
        .array()
        .items(joi.string())
        .required()
        .description(
          'The command to run. The first part of the array should be an executable available on a global PATH or a relative path to an executable. To run a shell script, you need to specify the shell as part of the command, e.g. `["sh", "-c", "<your sript>"]` or `["bash", "-s", "<your sript>"]`'
        )
        .example(["sh", "-c", "echo foo"]),
      env: joiEnvVars().description("Environment variables to set when running the command."),
    })
    .description(
      "A command to run. If both this and `gardenCommand` are specified, this command is run ahead of the Garden command."
    )

export const customCommandGardenCommandSchema = () =>
  joi
    .array()
    .items(joi.string())
    .description(
      "Run the specified Garden command. If both this and `exec` are specified, the script is run ahead of this command."
    )

export const customCommandSchema = () =>
  joi
    .object()
    .keys({
      apiVersion: apiVersionSchema(),
      kind: joi.string().default("Command").valid("Command").description("Indicate what kind of config this is."),
      path: joi.string().meta({ internal: true }),
      configPath: joi.string().meta({ internal: true }).description("The path to the project config file."),
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
      exec: customCommandExecSchema(),
      gardenCommand: customCommandGardenCommandSchema(),
      variables: joiVariables().description("A map of variables that can be referenced in `exec` and `gardenCommand`."),
    })
    .or("exec", "gardenCommand")
