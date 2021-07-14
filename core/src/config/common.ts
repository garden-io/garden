/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import Ajv from "ajv"
import { splitLast } from "../util/util"
import { deline, dedent } from "../util/string"
import { cloneDeep } from "lodash"
import { joiPathPlaceholder } from "./validation"
import { DEFAULT_API_VERSION } from "../constants"

export const objectSpreadKey = "$merge"

const ajv = new Ajv({ allErrors: true, useDefaults: true })

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
  "https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories"

export const enumToArray = (Enum) => Object.values(Enum).filter((k) => typeof k === "string") as string[]

// Extend the Joi module with our custom rules
interface MetadataKeys {
  internal?: boolean
  deprecated?: boolean | string
  enterprise?: boolean
  extendable?: boolean
  experimental?: boolean
  keyPlaceholder?: string
}

// Need this to fix the Joi typing
export interface JoiDescription extends Joi.Description {
  type: string
  name: string
  level: number
  flags?: {
    default?: any
    description?: string
    presence?: string
    only?: boolean
  }
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

export interface CustomObjectSchema extends Joi.ObjectSchema {
  concat(schema: object): this
  jsonSchema(schema: object): this
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

export interface Schema extends Joi.Root {
  object: () => CustomObjectSchema
  environment: () => Joi.StringSchema
  gitUrl: () => GitUrlSchema
  posixPath: () => PosixPathSchema
  hostname: () => Joi.StringSchema
  sparseArray: () => Joi.ArraySchema
}

export let joi: Schema = Joi.extend({
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
      return { value, errors: error("base") }
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

// We're supposed to be able to chain extend calls, but the TS definitions are off
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

/**
 * Add a joi.environment() type, used for validating an environment name, including an optional namespace
 * (e.g. my-namespace.env-name).
 */
joi = joi.extend({
  base: Joi.string(),
  type: "environment",
  messages: {
    base: "{{#label}} must be a valid environment name or <namespace>.<environment>",
    multipleDelimiters: "{{#label}} may only contain a single delimiter",
  },
  validate(value: string, { error }) {
    const baseSchema = joi.string().hostname()
    const result = baseSchema.validate(value)

    if (result.error) {
      return { value, errors: error("base") }
    }

    const split = value.split(".")

    if (split.length > 2) {
      return { value, errors: error("multipleDelimiters") }
    }

    return { value }
  },
})

/**
 * Extend the joi.object() type with additional methods and minor customizations, including one for validating with a
 * JSON Schema.
 *
 * Note that the jsonSchema() option should generally not be used in conjunction with other options (like keys()
 * and unknown()) since the behavior can be confusing. It is meant to facilitate a gradual transition away from Joi.
 */
joi = joi.extend({
  base: Joi.object(),
  type: "object",
  messages: {
    validation: "<not used>",
  },
  // TODO: check if jsonSchema() is being used in conjunction with other methods that may be incompatible.
  // validate(value: string, { error }) {
  //   return { value }
  // },
  args(schema: any, keys: any) {
    // Always allow the $merge key, which we resolve and collapse in resolveTemplateStrings()
    return schema.keys({
      [objectSpreadKey]: joi.alternatives(joi.object(), joi.string()),
      ...(keys || {}),
    })
  },
  rules: {
    jsonSchema: {
      method(jsonSchema: object) {
        // tslint:disable-next-line: no-invalid-this
        this.$_setFlag("jsonSchema", jsonSchema)
        // tslint:disable-next-line: no-invalid-this
        return this.$_addRule(<any>{ name: "jsonSchema", args: { jsonSchema } })
      },
      args: [
        {
          name: "jsonSchema",
          assert: (value) => {
            return !!value
          },
          message: "must be a valid JSON Schema with type=object",
          normalize: (value) => {
            if (value.type !== "object") {
              return false
            }

            try {
              return ajv.compile(value)
            } catch (err) {
              return false
            }
          },
        },
      ],
      validate(originalValue, helpers, args) {
        const validate = args.jsonSchema

        // Need to do this to be able to assign defaults without mutating original value
        const value = cloneDeep(originalValue)
        const valid = validate(value)

        if (valid) {
          return value
        } else {
          // TODO: customize the rendering here to make it a bit nicer
          const errors = [...validate.errors]
          const error = helpers.error("validation")
          error.message = ajv.errorsText(errors, { dataVar: `value at ${joiPathPlaceholder}` })
          return error
        }
      },
    },
  },
})

/**
 * Add a joi.hostname() type. Like joi.string().hostname() with the exception that it allows
 * wildcards in the first DNS label and returns a custom error if it finds wildcards in labels
 * other than the first.
 */
joi = joi.extend({
  base: Joi.string(),
  type: "hostname",
  messages: {
    base: "{{#label}} must be a valid hostname.",
    wildcardLabel: "{{#label}} only first DNS label my contain a wildcard.",
  },
  validate(value: string, { error }) {
    const baseSchema = joi.string().hostname()
    const wildcardLabel = "*."
    let result: Joi.ValidationResult

    const labels = value.split(".")
    // Hostname includes a wildcard label that is not the first label
    if (!value.startsWith(wildcardLabel) && labels.includes("*")) {
      return { value, errors: error("wildcardLabel") }
    }

    if (value.startsWith(wildcardLabel)) {
      const restLabels = value.slice(wildcardLabel.length)
      result = baseSchema.validate(restLabels)
    } else {
      result = baseSchema.validate(value)
    }

    if (result.error) {
      return { value, errors: error("base") }
    }

    return { value }
  },
})

/**
 * Add a joi.sparseArray() type, that both allows sparse arrays _and_ filters the falsy values out.
 */
joi = joi.extend({
  base: Joi.array().sparse(true),
  type: "sparseArray",
  coerce: {
    method(value) {
      return { value: value && value.filter((v: any) => v !== undefined && v !== null) }
    },
  },
})

export const joiPrimitive = () =>
  joi
    .alternatives()
    .try(joi.string().allow("").allow(null), joi.number(), joi.boolean())
    .description("Number, string or boolean")

export const absolutePathRegex = /^\/.*/ // Note: Only checks for the leading slash
// from https://stackoverflow.com/a/12311250/3290965
export const identifierRegex = /^(?![0-9]+$)(?!.*-$)(?!-)[a-z0-9-]{1,63}$/
export const userIdentifierRegex = /^(?!garden)(?=.{1,63}$)[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const envVarRegex = /^(?!garden)[a-z_][a-z0-9_\.]*$/i
export const gitUrlRegex = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\/?|\#[-\d\w._\/]+?)$/
export const variableNameRegex = /[a-zA-Z][a-zA-Z0-9_\-]*/i

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
  joi.array().items(joi.posixPath().allowGlobs().subPathOnly()).description(moduleIncludeDescription(extraDescription))

export const joiIdentifier = () =>
  joi
    .string()
    .regex(identifierRegex)
    .description(joiIdentifierDescription[0].toUpperCase() + joiIdentifierDescription.slice(1))

export const joiProviderName = (name: string) =>
  joiIdentifier().required().description("The name of the provider plugin to use.").default(name).example(name)

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

export const joiVariablesDescription =
  "Keys may contain letters and numbers. Any values are permitted, including arrays and objects of any nesting."

export const joiVariableName = () => joi.string().regex(variableNameRegex)

export const joiVariables = () =>
  joi
    .object()
    .pattern(variableNameRegex, joi.alternatives(joiPrimitive(), joi.link("..."), joi.array().items(joi.link("..."))))
    .default(() => ({}))
    .unknown(true)
    .description("Key/value map. " + joiVariablesDescription)

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

export const joiArray = (schema: Joi.Schema) => joi.array().items(schema).default([])

// This allows null, empty string or undefined values on the item values and then filters them out
export const joiSparseArray = (schema: Joi.Schema) => joi.sparseArray().items(schema.allow(null)).default([])

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

export const versionStringSchema = () =>
  joi.string().regex(/^v/).required().description("A Stack Graph node (i.e. module, service, task or test) version.")

const fileNamesSchema = () => joiArray(joi.string()).description("List of file paths included in the version.")

export const treeVersionSchema = () =>
  joi.object().keys({
    contentHash: joi.string().required().description("The hash of all files belonging to the Garden module."),
    files: fileNamesSchema(),
  })

export const moduleVersionSchema = () =>
  joi.object().keys({
    versionString: versionStringSchema(),
    dependencyVersions: joi
      .object()
      .pattern(/.+/, treeVersionSchema())
      .default(() => ({}))
      .description("The version of each of the dependencies of the module."),
    files: fileNamesSchema(),
  })

export const apiVersionSchema = () =>
  joi
    .string()
    .default(DEFAULT_API_VERSION)
    .valid(DEFAULT_API_VERSION)
    .description("The schema version of this config (currently not used).")
