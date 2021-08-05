/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { v4 as uuidv4 } from "uuid"
import { TemplateStringError } from "../exceptions"
import { keyBy, mapValues, escapeRegExp, trim, isEmpty, camelCase, kebabCase, isArrayLike } from "lodash"
import { joi, JoiDescription } from "../config/common"
import Joi from "@hapi/joi"
import { validateSchema } from "../config/validation"
import { safeLoad, safeLoadAll } from "js-yaml"
import { safeDumpYaml } from "../util/util"

interface TemplateHelperFunction {
  name: string
  description: string
  arguments: { [name: string]: Joi.Schema }
  outputSchema: Joi.Schema
  exampleArguments: any[][]
  exampleOutput?: any
  fn: Function
}

const helperFunctionSpecs: TemplateHelperFunction[] = [
  {
    name: "base64Decode",
    description: "Decodes the given base64-encoded string.",
    arguments: {
      string: joi.string().required().description("The base64-encoded string to decode."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["bXkgdmFsdWU="]],
    fn: (str: string) => Buffer.from(str, "base64").toString(),
  },
  {
    name: "base64Encode",
    description: "Encodes the given string as base64.",
    arguments: {
      string: joi.string().required().description("The string to encode."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["my value"]],
    fn: (str: string) => Buffer.from(str).toString("base64"),
  },
  {
    name: "camelCase",
    description:
      "Converts the given string to a valid camelCase identifier, changing the casing and removing characters as necessary.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["Foo Bar"], ["--foo-bar--"], ["__FOO_BAR__"]],
    fn: (str: string) => camelCase(str),
  },
  {
    name: "isEmpty",
    description: "Returns true if the given value is an empty string, object, array, null or undefined.",
    arguments: {
      value: joi.alternatives(joi.object(), joi.array(), joi.string()).allow(null).description("The value to check."),
    },
    outputSchema: joi.boolean(),
    exampleArguments: [[{}], [{ not: "empty" }], [[]], [[1, 2, 3]], [""], ["not empty"], [null]],
    fn: (value: any) => value === undefined || isEmpty(value),
  },
  {
    name: "jsonDecode",
    description: "Decodes the given JSON-encoded string.",
    arguments: {
      string: joi.string().required().description("The JSON-encoded string to decode."),
    },
    outputSchema: joi.any(),
    exampleArguments: [['{"foo": "bar"}'], ['"JSON encoded string"'], ['["my", "json", "array"]']],
    fn: (str: string) => JSON.parse(str),
  },
  {
    name: "jsonEncode",
    description: "Encodes the given value as JSON.",
    arguments: {
      value: joi.any().required().description("The value to encode as JSON."),
    },
    outputSchema: joi.string(),
    exampleArguments: [[["some", "array"]], [{ some: "object" }]],
    fn: (value: any) => JSON.stringify(value),
  },
  {
    name: "kebabCase",
    description:
      "Converts the given string to a valid kebab-case identifier, changing to all lowercase and removing characters as necessary.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["Foo Bar"], ["fooBar"], ["__FOO_BAR__"]],
    fn: (str: string) => kebabCase(str),
  },
  {
    name: "lower",
    description: "Convert the given string to all lowercase.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["Some String"]],
    fn: (str: string) => str.toLowerCase(),
  },
  {
    name: "replace",
    description: "Replaces all occurrences of a given substring in a string.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
      substring: joi.string().required().description("The substring to replace."),
      replacement: joi
        .string()
        .required()
        .allow("")
        .description("The replacement for each instance found of the `substring`."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      ["string_with_underscores", "_", "-"],
      ["remove.these.dots", ".", ""],
    ],
    fn: (str: string, substring: string, replacement: string) =>
      str.replace(new RegExp(escapeRegExp(substring), "g"), replacement),
  },
  {
    name: "slice",
    description:
      "Slices a string or array at the specified start/end offsets. Note that you can use a negative number for the end offset to count backwards from the end.",
    arguments: {
      input: joi.alternatives(joi.string(), joi.array()).required().description("The string or array to slice."),
      start: joi.string().required().description("The first index you want from the string/array."),
      end: joi
        .string()
        .description(
          "The last index you want from the string/array. Specify a negative number to count backwards from the end."
        ),
    },
    outputSchema: joi.alternatives(joi.string(), joi.array()),
    exampleArguments: [
      ["ThisIsALongStringThatINeedAPartOf", 11, -7],
      [".foo", 1],
    ],
    fn: (stringOrArray: string | any[], start: number, end?: number) => stringOrArray.slice(start, end),
  },
  {
    name: "split",
    description: "Splits the given string by a substring (e.g. a comma, colon etc.).",
    arguments: {
      string: joi.string().required().description("The string to split."),
      separator: joi.string().required().description("The separator to split by."),
    },
    outputSchema: joi.array().items(joi.string()),
    exampleArguments: [
      ["a,b,c", ","],
      ["1:2:3:4", ":"],
    ],
    fn: (str: string, separator: string) => str.split(separator),
  },
  {
    name: "trim",
    description: "Trims whitespace (or other specified characters) off the ends of the given string.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
      characters: joi
        .string()
        .description("The characters to strip off the string (defaults to any whitespace characters)."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["   some string with surrounding whitespace "]],
    fn: (str: string, characters?: string) => trim(str, characters),
  },
  {
    name: "upper",
    description: "Converts the given string to all uppercase.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [["Some String"]],
    fn: (str: string) => str.toUpperCase(),
  },
  {
    name: "uuidv4",
    description: "Generates a random v4 UUID.",
    arguments: {},
    outputSchema: joi.string(),
    exampleArguments: [[]],
    exampleOutput: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    fn: () => uuidv4(),
  },
  {
    name: "yamlDecode",
    description:
      "Decodes the given YAML-encoded string. Note that for multi-document YAML strings, you need to set the 2nd argument to true (see below).",
    arguments: {
      string: joi.string().required().description("The YAML-encoded string to decode."),
      multiDocument: joi.boolean().description("Set to true if you'd like to parse a multi-document YAML string."),
    },
    outputSchema: joi.any(),
    exampleArguments: [["a: 1\nb: 2\n"], ["a: 1\nb: 2\n---\na: 3\nb: 4\n", true]],
    fn: (str: string, multi?: boolean) => (multi ? safeLoadAll(str) : safeLoad(str)),
  },
  {
    name: "yamlEncode",
    description: "Encodes the given value as YAML.",
    arguments: {
      value: joi.any().required().description("The value to encode as YAML."),
      multiDocument: joi.boolean().description("Set to true if you'd like to output a multi-document YAML string."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      [{ my: "simple document" }],
      [
        [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
        ],
        true,
      ],
    ],
    fn: (value: any, multiDocument?: boolean) => {
      if (multiDocument) {
        if (!isArrayLike(value)) {
          throw new TemplateStringError(
            `yamlEncode: Set multiDocument=true but value is not an array (got ${typeof value})`,
            {
              value,
              multiDocument,
            }
          )
        }
        return "---" + value.map(safeDumpYaml).join("---")
      } else {
        return safeDumpYaml(value)
      }
    },
  },
]

export const helperFunctions = keyBy(
  helperFunctionSpecs.map((spec) => {
    const argumentDescriptions = mapValues(spec.arguments, (s) => s.describe() as JoiDescription)
    const usageArgs = Object.entries(argumentDescriptions).map(([name, desc]) => {
      if (desc.flags?.presence === "required") {
        return name
      } else {
        return `[${name}]`
      }
    })

    const examples = spec.exampleArguments.map((args) => {
      const argsEncoded = args.map((arg) => JSON.stringify(arg))
      const exampleValue = JSON.stringify(spec.fn(...args))
      const result = spec.exampleOutput || exampleValue
      return {
        template: "${" + `${spec.name}(${argsEncoded.join(", ")})}`,
        result,
      }
    })

    return {
      ...spec,
      argumentDescriptions,
      usage: `${spec.name}(${usageArgs.join(", ")})`,
      examples,
    }
  }),
  "name"
)

export function callHelperFunction(functionName: string, args: any[], text: string) {
  const spec = helperFunctions[functionName]

  if (!spec) {
    const availableFns = Object.keys(helperFunctions).join(", ")
    const _error = new TemplateStringError(
      `Could not find helper function '${functionName}'. Available helper functions: ${availableFns}`,
      { functionName, text }
    )
    return { _error }
  }

  const resolvedArgs: any[] = []

  for (const arg of args) {
    if (arg._error) {
      return arg
    }

    if (arg && arg.resolved) {
      resolvedArgs.push(arg.resolved)
    } else {
      resolvedArgs.push(arg)
    }
  }

  // Validate args
  let i = 0

  for (const [argName, schema] of Object.entries(spec.arguments)) {
    const value = resolvedArgs[i]
    const schemaDescription = spec.argumentDescriptions[argName]

    if (value === undefined && schemaDescription.flags?.presence === "required") {
      return {
        _error: new TemplateStringError(`Missing argument '${argName}' for ${functionName} helper function.`, {
          text,
          missingArgumentName: argName,
          missingArgumentIndex: i,
        }),
      }
    }

    try {
      resolvedArgs[i] = validateSchema(value, schema, {
        context: `argument '${argName}' for ${functionName} helper function`,
        ErrorClass: TemplateStringError,
      })
    } catch (_error) {
      return { _error }
    }

    i++
  }

  try {
    const resolved = spec.fn(...resolvedArgs)
    return { resolved }
  } catch (error) {
    const _error = new TemplateStringError(`Error from helper function ${functionName}: ${error.message}`, {
      error,
      text,
    })
    return { _error }
  }
}
