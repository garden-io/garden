/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { splitLast } from "../util/util"
import { deline, dedent } from "../util/string"

export type Primitive = string | number | boolean | null

export interface StringMap {
  [key: string]: string
}
export interface PrimitiveMap {
  [key: string]: Primitive
}
export interface DeepPrimitiveMap {
  [key: string]: Primitive | DeepPrimitiveMap | Primitive[] | DeepPrimitiveMap[]
}

// export type ConfigWithSpec<S extends object> = <T extends S>{
//   spec: Omit<T, keyof S> & Partial<S>
// }

export const includeGuideLink =
  "https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories"

export const enumToArray = (Enum) => Object.values(Enum).filter((k) => typeof k === "string") as string[]

// Extend the Joi module with our custom rules
interface MetadataKeys {
  internal?: boolean
  deprecated?: boolean
  extendable?: boolean
  experimental?: boolean
  keyPlaceholder?: string
}

// Unfortunately we need to explicitly extend each type (just extending the AnySchema doesn't work).
declare module "@hapi/joi" {
  export interface AnySchema {
    meta(keys: MetadataKeys): this
  }

  export interface ArraySchema {
    meta(keys: MetadataKeys): this
  }

  export interface AlternativesSchema {
    meta(keys: MetadataKeys): this
  }

  export interface BinarySchema {
    meta(keys: MetadataKeys): this
  }

  export interface BooleanSchema {
    meta(keys: MetadataKeys): this
  }

  export interface DateSchema {
    meta(keys: MetadataKeys): this
  }

  export interface FunctionSchema {
    meta(keys: MetadataKeys): this
  }

  export interface NumberSchema {
    meta(keys: MetadataKeys): this
  }

  export interface ObjectSchema {
    meta(keys: MetadataKeys): this
  }

  export interface StringSchema {
    meta(keys: MetadataKeys): this
  }

  export interface LazySchema {
    meta(keys: MetadataKeys): this
  }
}

export interface GitUrlSchema extends Joi.StringSchema {
  requireHash(): this
}

export interface PosixPathSchema extends Joi.StringSchema {
  absoluteOnly(): this
  allowGlobs(): this
  filenameOnly(): this
  relativeOnly(): this
  subPathOnly(): this
}

interface CustomJoi extends Joi.Root {
  gitUrl: () => GitUrlSchema
  posixPath: () => PosixPathSchema
}

export let joi: CustomJoi = Joi.extend({
  base: Joi.string(),
  type: "posixPath",
  flags: {
    allowGlobs: { default: false },
  },
  messages: {
    base: "{{#label}} must be a POSIX-style path",
    absoluteOnly: "{{#label}} must be a an absolute path",
    allowGlobs: "{{#label}} must not include globs (wildcards)",
    filenameOnly: "{{#label}} must be a filename (may not contain slashes)",
    relativeOnly: "{{#label}} must be a relative path (may not be an absolute path)",
    subPathOnly: "{{#label}} must be a relative sub-path (may not contain '..' segments or be an absolute path)",
  },
  validate(value, { schema, error }) {
    // Note: This relativeOnly param is in the context of URLs.
    // Our own relativeOnly param is in the context of file paths.
    const baseSchema = Joi.string().uri({ relativeOnly: true })
    const result = baseSchema.validate(value)

    if (result.error) {
      return { value, errors: error("posixPath") }
    }

    if (!schema.$_getFlag("allowGlobs") && (value.includes("*") || value.includes("?"))) {
      return { value, errors: error("allowGlobs") }
    }

    return { value }
  },
  rules: {
    allowGlobs: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_setFlag("allowGlobs", true)
      },
      validate(value) {
        // This is validated above ^
        return value
      },
    },
    absoluteOnly: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule("absoluteOnly")
      },
      validate(value, { error }) {
        if (!value.startsWith("/")) {
          return error("absoluteOnly")
        }

        return value
      },
    },
    filenameOnly: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule("filenameOnly")
      },
      validate(value, { error }) {
        if (value.includes("/")) {
          return error("filenameOnly")
        }

        return value
      },
    },
    relativeOnly: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule("relativeOnly")
      },
      validate(value, { error }) {
        if (value.startsWith("/")) {
          return error("relativeOnly")
        }

        return value
      },
    },
    subPathOnly: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule("subPathOnly")
      },
      validate(value, { error }) {
        if (value.startsWith("/") || value.split("/").includes("..")) {
          return error("subPathOnly")
        }

        return value
      },
    },
  },
})

// We're supposed to be able to chain extend calls
joi = joi.extend({
  base: Joi.string(),
  type: "gitUrl",
  messages: {
    base: "{{#label}} must be a valid Git repository URL",
    requireHash: "{{#label}} must specify a branch/tag hash",
  },
  validate(value: string, { error }) {
    const baseSchema = joi.string().regex(gitUrlRegex)
    const result = baseSchema.validate(value)

    if (result.error) {
      return { value, errors: error("base") }
    }

    return { value }
  },
  rules: {
    requireHash: {
      method() {
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule("requireHash")
      },
      validate(value, { error }) {
        const url = splitLast(value, "#")[0]
        if (!url) {
          return error("requireHash")
        }

        return value
      },
    },
  },
})

export const joiPrimitive = () =>
  joi
    .alternatives()
    .try(
      joi.number(),
      joi
        .string()
        .allow("")
        .allow(null),
      joi.boolean()
    )
    .description("Number, string or boolean")

export const absolutePathRegex = /^\/.*/ // Note: Only checks for the leading slash
// from https://stackoverflow.com/a/12311250/3290965
export const identifierRegex = /^(?![0-9]+$)(?!.*-$)(?!-)[a-z0-9-]{1,63}$/
export const userIdentifierRegex = /^(?!garden)(?=.{1,63}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const envVarRegex = /^(?!garden)[a-z_][a-z0-9_\.]*$/i
export const gitUrlRegex = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\/?|\#[-\d\w._\/]+?)$/

export const joiIdentifierDescription =
  "valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, " +
  "and cannot end with a dash) and must not be longer than 63 characters."

const moduleIncludeDescription = (extraDescription?: string) => {
  const desc = dedent`
  Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do *not* match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

  Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.

  Also note that specifying an empty list here means _no sources_ should be included.
  `
  if (extraDescription) {
    return desc + "\n\n" + extraDescription
  }
  return desc
}

export const joiModuleIncludeDirective = (extraDescription?: string) =>
  joi
    .array()
    .items(
      joi
        .posixPath()
        .allowGlobs()
        .subPathOnly()
    )
    .description(moduleIncludeDescription(extraDescription))

export const joiIdentifier = () =>
  joi
    .string()
    .regex(identifierRegex)
    .description(joiIdentifierDescription[0].toUpperCase() + joiIdentifierDescription.slice(1))

export const joiProviderName = (name: string) =>
  joiIdentifier()
    .required()
    .description("The name of the provider plugin to use.")
    .default(name)
    .example(name)

export const joiStringMap = (valueSchema: Joi.Schema) => joi.object().pattern(/.+/, valueSchema)

export const joiUserIdentifier = () =>
  joi
    .string()
    .regex(userIdentifierRegex)
    .description(
      deline`
        Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with \`garden\`, or be longer than 63 characters.
      `
    )

export const joiIdentifierMap = (valueSchema: Joi.Schema) =>
  joi
    .object()
    .pattern(identifierRegex, valueSchema)
    .default(() => ({}))
    .description("Key/value map. Keys must be valid identifiers.")

export const joiVariables = () =>
  joi
    .object()
    .pattern(/[a-zA-Z][a-zA-Z0-9_\-]+/i, joiPrimitive())
    .default(() => ({}))
    .unknown(false)
    .description("Key/value map. Keys may contain letters and numbers, and values must be primitives.")

export const joiEnvVars = () =>
  joi
    .object()
    .pattern(envVarRegex, joiPrimitive())
    .default(() => ({}))
    .unknown(false)
    .description(
      "Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
        "(must not start with `GARDEN`) and values must be primitives."
    )

export const joiArray = (schema: Joi.Schema) =>
  joi
    .array()
    .items(schema)
    .default([])

export const joiRepositoryUrl = () =>
  joi
    .alternatives(
      joi.gitUrl().requireHash(),
      // Allow file URLs as well
      joi.string().uri({ scheme: ["file"] })
    )
    .description(
      "A remote repository URL. Currently only supports git servers. Must contain a hash suffix" +
        " pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>"
    )
    .example("git+https://github.com/org/repo.git#v2.0")

// TODO
export const joiSchema = () => joi.object().unknown(true)

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
}
