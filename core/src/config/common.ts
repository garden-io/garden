/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SchemaLike } from "@hapi/joi"
import Joi from "@hapi/joi"
import type { JSONSchemaType, ValidateFunction } from "ajv"
import ajvPackage from "ajv"

const Ajv = ajvPackage.default
import addFormatsPackage from "ajv-formats"

const addFormats = addFormatsPackage.default
import { splitLast, deline, dedent, naturalList, titleize } from "../util/string.js"
import cloneDeep from "fast-copy"
import { isArray, isPlainObject, isString, mapValues, memoize } from "lodash-es"
import { joiPathPlaceholder } from "./validation.js"
import { GardenApiVersion } from "../constants.js"
import type { ActionKind } from "../actions/types.js"
import { actionKinds, actionKindsLower } from "../actions/types.js"
import { ConfigurationError, InternalError } from "../exceptions.js"
import type { ConfigContextType } from "./template-contexts/base.js"
import { z } from "zod"
import {
  gitUrlRegex,
  identifierRegex,
  joiIdentifierDescription,
  userIdentifierRegex,
  variableNameRegex,
  envVarRegex,
  arrayForEachReturnKey,
  arrayForEachFilterKey,
  arrayForEachKey,
  arrayConcatKey,
  objectSpreadKey,
} from "./constants.js"
import { renderZodError } from "./zod.js"
import { makeDocsLinkPlain } from "../docs/common.js"
import type { Deprecation } from "../util/deprecations.js"

// Avoid chasing moved references
export * from "./constants.js"

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false })
addFormats(ajv)

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

export interface VarfileMap {
  path: string
  optional?: boolean
}

export type Varfile = VarfileMap | string

export const includeGuideLink = makeDocsLinkPlain(
  "using-garden/configuration-overview",
  "#including-excluding-files-and-directories"
)

export const enumToArray = (Enum: any) => Object.values(Enum).filter((k) => typeof k === "string") as string[]

// Extend the Joi module with our custom rules
export interface MetadataKeys {
  // Unique name to identify in error messages etc
  name?: string
  // Flag as an advanced feature, to be advised in generated docs
  advanced?: boolean
  // Flag as deprecated. Set to a string to provide a deprecation message for docs.
  /**
   * deprecated is deprecated :P
   * @deprecated use {@link #deprecation} flag instead
   */
  deprecated?: boolean | string
  // Flag as deprecated. Set to automatically generate a message for docs.
  deprecation?: Deprecation | boolean
  // Field is specific to Garden Cloud/Enterprise
  enterprise?: boolean
  // Indicate this schema is expected to be extended by e.g. plugins
  extendable?: boolean
  // Usually applied automatically via createSchema. Indicates which schema this extends.
  extends?: string
  // Flag as experimental in docs
  experimental?: boolean
  // Used for clarity in documentation on key/value mapping fields
  keyPlaceholder?: string
  // Flag for internal use only, so that the field will not appear in generated docs
  internal?: boolean
  // Advise which template context is available for the field, for documentation purposes
  // Set to null if no templating is supported for the field.
  templateContext?: ConfigContextType | null
  // Flag to be used with numbers, if the default value should be rendered in octal representation.
  isOctal?: boolean
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
  metas?: {
    [key: string]: object
  }[]
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

  jsonSchema(schema: any): this

  zodSchema(schema: z.ZodObject<any>): this
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

interface ActionReferenceSchema extends Joi.AnySchema {
  kind(kind: ActionKind): this

  name(type: string): this
}

export interface Schema extends Joi.Root {
  object: () => CustomObjectSchema
  environment: () => Joi.StringSchema
  gitUrl: () => GitUrlSchema
  posixPath: () => PosixPathSchema
  hostname: () => Joi.StringSchema
  sparseArray: () => Joi.ArraySchema
  actionReference: () => ActionReferenceSchema
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
        return this.$_setFlag("allowGlobs", true)
      },
      validate(value) {
        // This is validated above ^
        return value
      },
    },
    absoluteOnly: {
      method() {
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
 * Compiles a JSON schema and caches the result.
 */
const compileJsonSchema = memoize(
  (schema: JSONSchemaType<Record<string, unknown>>) => {
    return ajv.compile(schema)
  },
  (s) => JSON.stringify(s)
)

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
    // Always allow the special $merge, $forEach etc. keys, which are part of the template language.
    // Note: we allow both the expected schema and strings, since they may be templates resolving to the expected type.
    return schema.keys({
      [objectSpreadKey]: joi.alternatives(joi.object(), joi.string()),
      [arrayConcatKey]: joi.alternatives(joi.array(), joi.string()),
      [arrayForEachKey]: joi.alternatives(joi.array(), joi.string()),
      [arrayForEachFilterKey]: joi.any(),
      [arrayForEachReturnKey]: joi.any(),
      ...(keys || {}),
    })
  },
  rules: {
    jsonSchema: {
      method(jsonSchema: JSONSchemaType<unknown>) {
        this.$_setFlag("jsonSchema", jsonSchema)

        return this.$_addRule(<any>{ name: "jsonSchema", args: { jsonSchema } })
      },
      args: [
        {
          name: "jsonSchema",
          assert: (value) => {
            return !!value
          },
          message: "must be a valid JSON Schema with type=object",
          normalize: (value: JSONSchemaType<unknown>): false | ValidateFunction<Record<string, unknown>> => {
            if (value.type !== "object") {
              return false
            }

            try {
              return compileJsonSchema(value)
            } catch (err) {
              return false
            }
          },
        },
      ],
      validate(originalValue, helpers, args) {
        const validate: ValidateFunction<Record<string, unknown>> = args.jsonSchema

        // Need to do this to be able to assign defaults without mutating original value
        const value = cloneDeep(originalValue)
        const valid = validate(value)

        if (valid) {
          return value
        } else {
          // TODO: customize the rendering here to make it a bit nicer
          const errors = [...validate.errors!]
          const error = helpers.error("validation")
          error.message = ajv.errorsText(errors, { dataVar: `value at ${joiPathPlaceholder}` })
          return error
        }
      },
    },

    zodSchema: {
      method(zodSchema: z.ZodObject<any>) {
        this.$_setFlag("zodSchema", zodSchema)

        return this.$_addRule(<any>{ name: "zodSchema", args: { zodSchema } })
      },
      args: [
        {
          name: "zodSchema",
          assert: (value) => {
            return !!value
          },
          message: "must be a valid Zod object schema",
        },
      ],
      validate(value, helpers, args) {
        const schema = args.zodSchema as z.ZodObject<any>

        try {
          return schema.parse(value)
        } catch (error) {
          if (!(error instanceof z.ZodError)) {
            throw error
          }
          const outputError = helpers.error("zodValidation")
          outputError.message = renderZodError(error)
          outputError.zodError = error

          if (error instanceof z.ZodError && error.issues.length > 0) {
            // Not perfect, but at least we can get the path of the first error
            outputError.path = error.issues[0].path
          }

          return outputError
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
    wildcardLabel: "{{#label}} only first DNS label may contain a wildcard.",
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

export interface ActionReference<K extends ActionKind = ActionKind> {
  kind: K
  name: string
}

const actionRefParseError = (reference: any) => {
  const validActionKinds = naturalList(actionKindsLower, { trailingWord: "or", quote: true })

  const refStr = JSON.stringify(reference)

  return new ConfigurationError({
    message: deline`
      Could not parse ${refStr} as a valid action reference.
      An action reference should be a "<kind>.<name>" string, where <kind> is one of
      ${validActionKinds} and <name> is a valid name of an action. You may also specify
      an object with separate kind and name fields.`,
  })
}

interface SchemaKeys {
  [key: string]: SchemaLike | SchemaLike[] | SchemaCallback
}

type SchemaCallback = () => Joi.Schema

export interface CreateSchemaParams {
  name: string
  description?: string
  keys: () => SchemaKeys
  extend?: () => Joi.ObjectSchema
  default?: any
  meta?: MetadataKeys
  allowUnknown?: boolean
  required?: boolean
  rename?: [string, string][]
  or?: string[][]
  xor?: string[][]
  oxor?: string[][]
  options?: Joi.ValidationOptions
}

export interface CreateSchemaOutput {
  (): Joi.ObjectSchema
}

interface SchemaRegistry {
  [name: string]: {
    spec: CreateSchemaParams
    schema?: Joi.ObjectSchema
  }
}

const schemaRegistry: SchemaRegistry = {}

export function createSchema(spec: CreateSchemaParams): CreateSchemaOutput {
  const { name } = spec

  if (schemaRegistry[name]) {
    throw new InternalError({ message: `Object schema ${name} defined multiple times` })
  }

  schemaRegistry[name] = { spec }

  return () => {
    let schema = schemaRegistry[name].schema
    if (!schema) {
      const meta: MetadataKeys = { ...spec.meta }
      meta.name = name

      const keys = mapValues(spec.keys(), (v) => {
        return typeof v === "function" ? v() : v
      })

      if (spec.extend) {
        const base = spec.extend()

        if (Object.keys(keys).length > 0) {
          schema = base.keys(keys)
        } else {
          schema = base
        }

        const description = base.describe()
        const baseMeta = metadataFromDescription(description)
        if (baseMeta.name) {
          meta.extends = baseMeta.name
        }
      } else {
        schema = joi.object().keys(keys)
      }

      schema = schema.meta(meta)

      if (spec.allowUnknown) {
        schema = schema.unknown(true)
      }
      if (spec.options) {
        schema = schema.options(spec.options)
      }
      if (spec.default) {
        schema = schema.default(spec.default)
      }
      if (spec.description) {
        schema = schema.description(spec.description)
      }
      if (spec.required) {
        schema = schema.required()
      }
      if (spec.rename) {
        for (const r of spec.rename) {
          schema = schema.rename(r[0], r[1])
        }
      }
      for (const or of spec.or || []) {
        schema = schema.or(...or)
      }
      for (const xor of spec.xor || []) {
        schema = schema.xor(...xor)
      }
      for (const oxor of spec.oxor || []) {
        schema = schema.oxor(...oxor)
      }

      schemaRegistry[name].schema = schema
    }
    return schema
  }
}

// Just used for tests
export function removeSchema(name: string) {
  if (schemaRegistry[name]) {
    delete schemaRegistry[name]
  }
}

/**
 * Parse, validate and normalize an action reference.
 *
 * The general format is <kind>.<name>, where kind is one of the defined action types, and name is a valid
 * identifier (same as joiIdentifier).
 *
 * You can also specify a full object, e.g. `{ kind: "Build", name: "foo" }`.
 */
export function parseActionReference(reference: string | object): ActionReference {
  if (isString(reference)) {
    const split = reference.toLowerCase().split(".")

    if (split.length !== 2 || !actionKindsLower.includes(<any>split[0]) || !split[1]) {
      throw actionRefParseError(reference)
    }

    const [kind, name] = split
    const nameResult = joiIdentifier().validate(name)

    if (nameResult.error) {
      throw actionRefParseError(reference)
    }

    return { kind: titleize(kind) as ActionKind, name }
  } else if (isPlainObject(reference)) {
    const kind = reference["kind"]

    if (!isString(kind)) {
      throw actionRefParseError(reference)
    }

    const nameResult = joiIdentifier().validate(reference["name"])

    if (nameResult.error || !actionKinds.includes(<any>kind)) {
      throw actionRefParseError(reference)
    }

    return { kind: <ActionKind>kind, name: reference["name"] }
  } else {
    throw actionRefParseError(reference)
  }
}

export const joiIdentifier = () =>
  joi
    .string()
    .regex(identifierRegex)
    .description(joiIdentifierDescription[0].toUpperCase() + joiIdentifierDescription.slice(1))

export const joiPrimitive = () =>
  joi
    .alternatives()
    .try(joi.string().allow("").allow(null), joi.number(), joi.boolean())
    .description("Number, string or boolean")

/**
 * Add a joi.actionReference() type, wrapping the parseActionReference() function and returning it as a parsed object.
 */
joi = joi.extend({
  base: Joi.any(),
  type: "actionReference",
  flags: {
    kind: { default: undefined },
    name: { default: undefined },
  },
  messages: {
    validation: "<not used>",
    wrongKind: "{{#label}} has the wrong action kind.",
  },
  validate(originalValue: string | object, opts) {
    try {
      const value = parseActionReference(originalValue)

      const expectedKind = opts.schema.$_getFlag("kind")

      if (expectedKind && value.kind !== expectedKind) {
        const error = opts.error("wrongKind")
        error.message += ` Expected '${expectedKind}', got '${value.kind}'`
        return { value, errors: error }
      }

      return { value }
    } catch (err) {
      if (!(err instanceof Error)) {
        throw err
      }
      const error = opts.error("validation")
      error.message = err.message
      return { errors: error }
    }
  },
  rules: {
    kind: {
      args: [
        {
          name: "kind",
          normalize: (v) => v,
          assert: joi
            .string()
            .allow(...actionKinds)
            .only(),
        },
      ],
      method(value: string) {
        return this.$_setFlag("kind", value)
      },
      validate(value) {
        // This is validated above ^
        return value
      },
    },
    name: {
      args: [
        {
          name: "name",
          assert: joiIdentifier(),
        },
      ],
      method(value: string) {
        return this.$_setFlag("name", value)
      },
      validate(value) {
        // Note: This is currently only advisory, and must be validated elsewhere!
        return value
      },
    },
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
      return { value: isArray(value) && value.filter((v: any) => v !== undefined && v !== null) }
    },
  },
})

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

export const joiProviderName = memoize((name: string) =>
  joiIdentifier().required().description("The name of the provider plugin to use.").default(name).example(name)
)

export const joiStringMap = memoize((valueSchema: Joi.Schema) => joi.object().pattern(/.+/, valueSchema))

export const joiUserIdentifier = memoize(() =>
  joi
    .string()
    .regex(userIdentifierRegex)
    .description(
      deline`
        Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with \`garden\`, or be longer than 63 characters.
      `
    )
)

export const joiIdentifierMap = memoize((valueSchema: Joi.Schema) =>
  joi
    .object()
    .pattern(identifierRegex, valueSchema)
    .default(() => ({}))
    .description("Key/value map. Keys must be valid identifiers.")
)

export const joiVarfile = memoize(() =>
  joi
    .alternatives(
      joi.posixPath().description("Path to a file containing a path."),
      joi.object().keys({
        path: joi.posixPath().required().description("Path to a file containing a path."),
        optional: joi.boolean().description("Whether the varfile is optional."),
      })
    )
    .description("A path to a file containing variables, or an object with a path and optional flag.")
)

export const joiVariablesDescription =
  "Keys may contain letters and numbers. Any values are permitted, including arrays and objects of any nesting."

export const joiVariableName = memoize(() => joi.string().regex(variableNameRegex))

export const joiVariables = memoize(() =>
  joi
    .object()
    .pattern(variableNameRegex, joi.alternatives(joiPrimitive(), joi.link("..."), joi.array().items(joi.link("..."))))
    .default(() => ({}))
    .unknown(true)
    .description("Key/value map. " + joiVariablesDescription)
)

export const joiEnvVars = memoize(() =>
  joi
    .object()
    .pattern(envVarRegex, joiPrimitive())
    .default(() => ({}))
    .unknown(false)
    .description(
      "Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
        "(must not start with `GARDEN`) and values must be primitives."
    )
)

export const joiArray = memoize((schema: Joi.Schema) => joi.array().items(schema).default([]))

// This allows null, empty string or undefined values on the item values and then filters them out
export const joiSparseArray = memoize((schema: Joi.Schema) => joi.sparseArray().items(schema.allow(null)).default([]))

export const joiRepositoryUrl = memoize(() =>
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
)

export function getSchemaDescription(schema: Joi.Schema) {
  return (<any>schema.describe().flags).description
}

// TODO
export const joiSchema = memoize(() => joi.object().unknown(true))

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
}

export const versionStringSchema = memoize(() =>
  joi.string().regex(/^v/).required().description("A Stack Graph node (i.e. module, service, task or test) version.")
)

const fileNamesSchema = memoize(() => joiArray(joi.string()).description("List of file paths included in the version."))

export const contentHashSchema = memoize(() =>
  joi.string().required().description("The hash of all files belonging to the Garden action/module.")
)

export const treeVersionSchema = createSchema({
  name: "tree-version",
  keys: () => ({
    contentHash: contentHashSchema,
    files: fileNamesSchema,
  }),
})

export const moduleVersionSchema = createSchema({
  name: "module-version",
  keys: () => ({
    contentHash: contentHashSchema,
    versionString: versionStringSchema,
    dependencyVersions: joi
      .object()
      .pattern(/.+/, versionStringSchema().description("version hash of the dependency module"))
      .default(() => ({}))
      .description("The version of each of the dependencies of the module."),
    files: fileNamesSchema,
  }),
})

/**
 * use this schema apiSchema when the apiVersion is part of the schema for potential future use, but is yet to be used.
 * The apiVersion field will be allowed, but hidden in the reference documentation.
 *
 * Only the value garden.io/v0 will be allowed.
 *
 * As soon as you start using the apiVersion field, you need to create a separate schema for your use case.
 **/
export const unusedApiVersionSchema = () =>
  joi
    .string()
    .valid(GardenApiVersion.v0)
    .default(GardenApiVersion.v0)
    .description("The schema version of this config (currently unused).")
    // hide the unused apiVersion field in the reference documentation, as it does not have an effect.
    .meta({ internal: true })

/**
 * A little hack to allow unknown fields on the schema and recursively on all object schemas nested in it.
 * Used when e.g. validating against the schema of a module type base (in which case we want to allow added fields
 * in the inheriting schema).
 */
export function allowUnknown<T extends Joi.Schema>(schema: T) {
  schema = cloneDeep(schema)

  if (schema["type"] === "object") {
    schema["_flags"].unknown = true

    for (const key of schema["$_terms"].keys || []) {
      key.schema = allowUnknown(key.schema)
    }
  } else if (schema["type"] === "array" || schema["type"] === "sparseArray") {
    const terms = schema["$_terms"]
    if (terms.items) {
      terms.items = terms.items.map((item: Joi.Schema) => allowUnknown(item))
    }
    if (terms._inclusions) {
      terms._inclusions = terms._inclusions.map((item: Joi.Schema) => allowUnknown(item))
    }
  }

  return schema
}

export const artifactsTargetDescription = dedent`
  A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at \`.garden/artifacts\`.
`

export function metadataFromDescription(desc: Joi.Description) {
  let meta: MetadataKeys = {}
  for (const m of desc.metas || []) {
    meta = { ...meta, ...m }
  }
  return meta
}

// TODO: expand this definition as needed
interface SchemaDescription {
  keys: string[]
  metadata: MetadataKeys
}

export function describeSchema(schema: Joi.ObjectSchema): SchemaDescription {
  const desc = schema.describe()

  return {
    keys: Object.keys(desc.keys || {}),
    metadata: metadataFromDescription(desc),
  }
}

export function zodObjectToJoi(schema: z.ZodObject<any>): Joi.ObjectSchema {
  let wrapped = joi.object().zodSchema(schema)

  const description = schema.description || ""

  const example = schema.getExample()
  if (example) {
    wrapped = wrapped.example(example)
  }

  if (description) {
    wrapped = wrapped.description(description)
  }

  return wrapped
}
