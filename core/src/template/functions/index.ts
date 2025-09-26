/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { v4 as uuidv4 } from "uuid"
import { createHash } from "node:crypto"
import { GardenError } from "../../exceptions.js"
import {
  camelCase,
  escapeRegExp,
  isArrayLike,
  isEmpty,
  isString,
  kebabCase,
  keyBy,
  mapValues,
  range,
  trim,
} from "lodash-es"
import type { JoiDescription, Primitive } from "../../config/common.js"
import { joi, joiPrimitive } from "../../config/common.js"
import type Joi from "@hapi/joi"
import { load, loadAll } from "js-yaml"
import { safeDumpYaml } from "../../util/serialization.js"
import indentString from "indent-string"
import { dateHelperFunctionSpecs } from "./date.js"
import type { CollectionOrValue } from "../../util/objects.js"
import type { TemplatePrimitive } from "../types.js"

export class TemplateFunctionCallError extends GardenError {
  type = "template-function-call"
}

interface ExampleArgument {
  input: unknown[]
  output: unknown // Used to validate expected output
  skipTest?: boolean
}

export interface TemplateHelperFunction {
  name: string
  description: string
  arguments: { [name: string]: Joi.Schema }
  outputSchema: Joi.Schema
  exampleArguments: ExampleArgument[]
  fn: (...args: any[]) => CollectionOrValue<TemplatePrimitive>
}

const helperFunctionSpecs: TemplateHelperFunction[] = [
  {
    name: "base64Decode",
    description: "Decodes the given base64-encoded string.",
    arguments: {
      string: joi.string().required().description("The base64-encoded string to decode."),
    },
    outputSchema: joi.string(),
    exampleArguments: [{ input: ["bXkgdmFsdWU="], output: "my value" }],
    fn: (str: string) => Buffer.from(str, "base64").toString(),
  },
  {
    name: "base64Encode",
    description: "Encodes the given string as base64.",
    arguments: {
      string: joi.string().required().description("The string to encode."),
    },
    outputSchema: joi.string(),
    exampleArguments: [{ input: ["my value"], output: "bXkgdmFsdWU=" }],
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
    exampleArguments: [
      { input: ["Foo Bar"], output: "fooBar" },
      { input: ["--foo-bar--"], output: "fooBar" },
      { input: ["__FOO_BAR__"], output: "fooBar" },
    ],
    fn: (str: string) => camelCase(str),
  },
  {
    name: "concat",
    description: "Concatenates two arrays or strings.",
    arguments: {
      arg1: joi
        .alternatives(joi.array(), joi.string())
        .allow("")
        .required()
        .description("The array or string to append to."),
      arg2: joi
        .alternatives(joi.array(), joi.string())
        .allow("")
        .required()
        .description("The array or string to append."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      {
        input: [
          ["first", "two"],
          ["second", "list"],
        ],
        output: ["first", "two", "second", "list"],
      },
      {
        input: [
          [1, 2, 3],
          [4, 5],
        ],
        output: [1, 2, 3, 4, 5],
      },
      { input: ["string1", "string2"], output: "string1string2" },
    ],
    fn: (arg1: any, arg2: any) => {
      if (isString(arg1) && isString(arg2)) {
        return arg1 + arg2
      } else if (Array.isArray(arg1) && Array.isArray(arg2)) {
        return [...arg1, ...arg2]
      } else {
        throw new TemplateFunctionCallError({
          message: `Both terms need to be either arrays or strings (got ${typeof arg1} and ${typeof arg2}).`,
        })
      }
    },
  },
  {
    name: "indent",
    description: "Indents each line in the given string with the specified number of spaces.",
    arguments: {
      string: joi.string().required().description("The string to indent."),
      spaces: joi.number().required().integer().description("How many spaces to add on each line."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["some: multiline\nyaml: document", 2], output: "  some: multiline\n  yaml: document" },
      { input: ["My\nblock\nof\ntext", 4], output: "    My\n    block\n    of\n    text" },
    ],
    fn: (str: string, spaces: number) => indentString(str, spaces),
  },
  {
    name: "isEmpty",
    description: "Returns true if the given value is an empty string, object, array, null or undefined.",
    arguments: {
      value: joi
        .alternatives(joi.object(), joi.array(), joi.string().allow(""))
        .allow(null)
        .description("The value to check."),
    },
    outputSchema: joi.boolean(),
    exampleArguments: [
      { input: [{}], output: true },
      { input: [{ not: "empty" }], output: false },
      { input: [[]], output: true },
      { input: [[1, 2, 3]], output: false },
      { input: [""], output: true },
      { input: ["not empty"], output: false },
      { input: [null], output: true },
    ],
    fn: (value: any) => value === undefined || isEmpty(value),
  },
  {
    name: "join",
    description:
      "Takes an array of strings (or other primitives) and concatenates them into a string, with the given separator",
    arguments: {
      input: joi.array().items(joiPrimitive()).required().description("The array to concatenate."),
      separator: joi.string().allow("").required().description("The string to place between each item in the array."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: [["some", "list", "of", "strings"], " "], output: "some list of strings" },
      { input: [["some", "list", "of", "strings"], "."], output: "some.list.of.strings" },
    ],
    fn: (input: Primitive[], separator: string) => input.join(separator),
  },
  {
    name: "jsonDecode",
    description: "Decodes the given JSON-encoded string.",
    arguments: {
      string: joi.string().required().description("The JSON-encoded string to decode."),
    },
    outputSchema: joi.any(),
    exampleArguments: [
      { input: ['{"foo": "bar"}'], output: { foo: "bar" } },
      { input: ['"JSON encoded string"'], output: "JSON encoded string" },
      { input: ['["my", "json", "array"]'], output: ["my", "json", "array"] },
    ],
    fn: (str: string) => JSON.parse(str),
  },
  {
    name: "jsonEncode",
    description: "Encodes the given value as JSON.",
    arguments: {
      value: joi.any().required().description("The value to encode as JSON."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: [["some", "array"]], output: '["some","array"]' },
      { input: [{ some: "object" }], output: '{"some":"object"}' },
    ],
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
    exampleArguments: [
      { input: ["Foo Bar"], output: "foo-bar" },
      { input: ["fooBar"], output: "foo-bar" },
      { input: ["__FOO_BAR__"], output: "foo-bar" },
    ],
    fn: (str: string) => kebabCase(str),
  },
  {
    name: "lower",
    description: "Convert the given string to all lowercase.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [{ input: ["Some String"], output: "some string" }],
    fn: (str: string) => str.toLowerCase(),
  },
  {
    name: "range",
    description: "Generates a list of numbers in the specified range (inclusively).",
    arguments: {
      first: joi.number().required().description("The first number in the range."),
      last: joi.number().required().description("The last number in the range (inclusive)."),
    },
    outputSchema: joi.array().items(joi.number()),
    exampleArguments: [{ input: [1, 5], output: [1, 2, 3, 4, 5] }],
    fn: (first: number, last: number) => range(first, last + 1),
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
      { input: ["string_with_underscores", "_", "-"], output: "string-with-underscores" },
      { input: ["remove.these.dots", ".", ""], output: "removethesedots" },
    ],
    fn: (str: string, substring: string, replacement: string) =>
      str.replace(new RegExp(escapeRegExp(substring), "g"), replacement),
  },
  {
    name: "sha256",
    description: "Creates a SHA256 hash of the provided string.",
    arguments: {
      string: joi.string().required().description("The string to hash."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: ["Some String"], output: "7f0fd64653ba0bb1a579ced2b6bf375e916cc60662109ee0c0b24f0a750c3a6c" },
    ],
    fn: (str: string) => createHash("sha256").update(str).digest("hex"),
  },
  {
    name: "slice",
    description:
      "Slices a string or array at the specified start/end offsets. Note that you can use a negative number for the end offset to count backwards from the end.",
    arguments: {
      input: joi.alternatives(joi.string(), joi.array()).required().description("The string or array to slice."),
      start: joi
        .alternatives(joi.number(), joi.string())
        .required()
        .description("The first index you want from the string/array."),
      end: joi
        .alternatives(joi.number(), joi.string())
        .description(
          "The last index you want from the string/array. Specify a negative number to count backwards from the end."
        ),
    },
    outputSchema: joi.alternatives(joi.string(), joi.array()),
    exampleArguments: [
      { input: ["ThisIsALongStringThatINeedAPartOf", 11, -7], output: "StringThatINeed" },
      { input: [".foo", 1], output: "foo" },
    ],
    fn: (stringOrArray: string | any[], start: number | string, end?: number | string) => {
      const parseInt = (value: number | string, name: string): number => {
        if (typeof value === "number") {
          return value
        }

        const result = Number.parseInt(value, 10)
        if (Number.isNaN(result)) {
          throw new TemplateFunctionCallError({
            message: `${name} index must be a number or a numeric string (got "${value}")`,
          })
        }
        return result
      }

      const startIdx = parseInt(start, "start")
      const endIdx = !!end ? parseInt(end, "end") : undefined
      return stringOrArray.slice(startIdx, endIdx)
    },
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
      { input: ["a,b,c", ","], output: ["a", "b", "c"] },
      { input: ["1:2:3:4", ":"], output: ["1", "2", "3", "4"] },
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
    exampleArguments: [
      { input: ["   some string with surrounding whitespace "], output: "some string with surrounding whitespace" },
    ],
    fn: (str: string, characters?: string) => trim(str, characters),
  },
  {
    name: "upper",
    description: "Converts the given string to all uppercase.",
    arguments: {
      string: joi.string().required().description("The string to convert."),
    },
    outputSchema: joi.string(),
    exampleArguments: [{ input: ["Some String"], output: "SOME STRING" }],
    fn: (str: string) => str.toUpperCase(),
  },
  {
    name: "string",
    description: "Converts the given value to a string.",
    arguments: {
      value: joi.any().required().description("The value to convert to string."),
    },
    outputSchema: joi.string(),
    exampleArguments: [
      { input: [1], output: "1" },
      { input: [true], output: "true" },
    ],
    fn: (val: any) => {
      return String(val)
    },
  },
  {
    name: "uuidv4",
    description: "Generates a random v4 UUID.",
    arguments: {},
    outputSchema: joi.string(),
    exampleArguments: [{ input: [], output: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", skipTest: true }],
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
    exampleArguments: [
      { input: ["a: 1\nb: 2\n"], output: { a: 1, b: 2 } },
      {
        input: ["a: 1\nb: 2\n---\na: 3\nb: 4\n", true],
        output: [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
        ],
      },
    ],
    fn: (str: string, multi?: boolean) => (multi ? loadAll(str) : load(str)) as CollectionOrValue<TemplatePrimitive>,
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
      { input: [{ my: "simple document" }], output: "my: simple document\n" },
      {
        input: [
          [
            { a: 1, b: 2 },
            { a: 3, b: 4 },
          ],
          true,
        ],
        output: "---a: 1\nb: 2\n---a: 3\nb: 4\n",
      },
    ],
    fn: (value: any, multiDocument?: boolean) => {
      if (multiDocument) {
        if (!isArrayLike(value)) {
          throw new TemplateFunctionCallError({
            message: `yamlEncode: Set multiDocument=true but value is not an array (got ${typeof value})`,
          })
        }
        return "---" + value.map(safeDumpYaml).join("---")
      } else {
        return safeDumpYaml(value)
      }
    },
  },
  ...dateHelperFunctionSpecs,
]

interface ResolvedHelperFunction extends TemplateHelperFunction {
  argumentDescriptions: {
    [name: string]: JoiDescription
  }
  usage: string
}

interface HelperFunctions {
  [name: string]: ResolvedHelperFunction
}

let _helperFunctions: HelperFunctions

export function getHelperFunctions(): HelperFunctions {
  if (_helperFunctions) {
    return _helperFunctions
  }

  _helperFunctions = keyBy(
    helperFunctionSpecs.map((spec) => {
      const argumentDescriptions = mapValues(spec.arguments, (s) => s.describe() as JoiDescription)
      const usageArgs = Object.entries(argumentDescriptions).map(([name, desc]) => {
        if (desc.flags?.presence === "required") {
          return name
        } else {
          return `[${name}]`
        }
      })

      return {
        ...spec,
        argumentDescriptions,
        usage: `${spec.name}(${usageArgs.join(", ")})`,
      }
    }),
    "name"
  )

  return _helperFunctions
}
