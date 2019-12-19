/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import { JoiObject } from "@hapi/joi"
import uuid from "uuid"
import { ConfigurationError, LocalConfigError } from "../exceptions"
import chalk from "chalk"
import { relative } from "path"
import { splitLast } from "../util/util"
import isGitUrl from "is-git-url"
import { deline, dedent } from "../util/string"

export type Primitive = string | number | boolean | null

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

interface JoiGitUrlParams {
  requireHash?: boolean
}

interface JoiPosixPathParams {
  absoluteOnly?: boolean
  allowGlobs?: boolean
  relativeOnly?: boolean
  subPathOnly?: boolean
  filenameOnly?: boolean
}

// Extend the Joi module with our custom rules
interface MetadataKeys {
  internal?: boolean
  deprecated?: boolean
  extendable?: boolean
  experimental?: boolean
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
    gitUrl: (params: JoiGitUrlParams) => this
    posixPath: (params?: JoiPosixPathParams) => this
  }

  export interface LazySchema {
    meta(keys: MetadataKeys): this
  }
}

export const joi: Joi.Root = Joi.extend({
  base: Joi.string(),
  name: "string",
  language: {
    gitUrl: "must be a valid Git repository URL",
    requireHash: "must specify a branch/tag hash",
    posixPath: "must be a POSIX-style path", // Used below as 'string.posixPath'
    absoluteOnly: "must be a an absolute path",
    allowGlobs: "must not include globs (wildcards)",
    relativeOnly: "must be a relative path (may not be an absolute path)",
    subPathOnly: "must be a relative sub-path (may not contain '..' segments or be an absolute path)",
    filenameOnly: "must be a filename (may not contain slashes)",
  },
  rules: [
    {
      name: "gitUrl",
      params: {
        options: Joi.object().keys({
          requireHash: Joi.boolean().description("Only allow Git URLs with a branch/tag hash."),
        }),
      },
      validate(params: { options?: JoiGitUrlParams }, value: string, state, prefs) {
        // Make sure it's a string
        const baseSchema = Joi.string()
        const result = baseSchema.validate(value)

        if (result.error) {
          return result.error
        }

        if (!isGitUrl(value)) {
          // tslint:disable-next-line:no-invalid-this
          return this.createError("string.gitUrl", { v: value }, state, prefs)
        }

        if (params.options && params.options.requireHash === true) {
          const url = splitLast(value, "#")[0]
          if (!url) {
            // tslint:disable-next-line:no-invalid-this
            return this.createError("string.requireHash", { v: value }, state, prefs)
          }
        }

        return value
      },
    },
    {
      name: "posixPath",
      params: {
        options: Joi.object()
          .keys({
            absoluteOnly: Joi.boolean().description("Only allow absolute paths (starting with /)."),
            allowGlobs: Joi.boolean().description("Allow globs (wildcards) in path."),
            relativeOnly: Joi.boolean().description("Disallow absolute paths (starting with /)."),
            subPathOnly: Joi.boolean().description(
              "Only allow sub-paths. That is, disallow '..' path segments and absolute paths."
            ),
            filenameOnly: Joi.boolean().description("Only allow filenames. That is, disallow '/' in the path."),
          })
          .oxor("absoluteOnly", "relativeOnly")
          .oxor("absoluteOnly", "filenameOnly")
          .oxor("absoluteOnly", "subPathOnly"),
      },
      validate(params: { options?: JoiPosixPathParams }, value: string, state, prefs) {
        // Note: This relativeOnly param is in the context of URLs.
        // Our own relativeOnly param is in the context of file paths.
        const baseSchema = Joi.string().uri({ relativeOnly: true })
        const result = baseSchema.validate(value)

        if (result.error) {
          // tslint:disable-next-line:no-invalid-this
          return this.createError("string.posixPath", { v: value }, state, prefs)
        }

        const options = params.options || {}

        if (options.absoluteOnly) {
          if (!value.startsWith("/")) {
            // tslint:disable-next-line:no-invalid-this
            return this.createError("string.absoluteOnly", { v: value }, state, prefs)
          }
        } else if (options.subPathOnly) {
          if (value.startsWith("/") || value.split("/").includes("..")) {
            // tslint:disable-next-line:no-invalid-this
            return this.createError("string.subPathOnly", { v: value }, state, prefs)
          }
        } else if (options.relativeOnly) {
          if (value.startsWith("/")) {
            // tslint:disable-next-line:no-invalid-this
            return this.createError("string.relativeOnly", { v: value }, state, prefs)
          }
        }

        if (options.filenameOnly && value.includes("/")) {
          // tslint:disable-next-line:no-invalid-this
          return this.createError("string.filenameOnly", { v: value }, state, prefs)
        }

        if (!options.allowGlobs && (value.includes("*") || value.includes("?"))) {
          // tslint:disable-next-line:no-invalid-this
          return this.createError("string.allowGlobs", { v: value }, state, prefs)
        }

        return value // Everything is OK
      },
    },
  ],
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

export const joiIdentifierDescription =
  "valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, " +
  "and cannot end with a dash) and must not be longer than 63 characters."

const moduleIncludeDescription = (extraDescription?: string) => {
  const desc = dedent`
  Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
  module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
  when responding to filesystem watch events, and when staging builds.

  Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your
  source tree, which use the same format as \`.gitignore\` files. See the
  [Configuration Files guide](${includeGuideLink}) for details.

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
    .items(joi.string().posixPath({ allowGlobs: true, subPathOnly: true }))
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

export const joiStringMap = (valueSchema: JoiObject) => joi.object().pattern(/.+/, valueSchema)

export const joiUserIdentifier = () =>
  joi
    .string()
    .regex(userIdentifierRegex)
    .description(
      deline`
        Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start
        with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with \`garden\`,
        or be longer than 63 characters.
      `
    )

export const joiIdentifierMap = (valueSchema: JoiObject) =>
  joi
    .object()
    .pattern(identifierRegex, valueSchema)
    .default(() => ({}), "{}")
    .description("Key/value map. Keys must be valid identifiers.")

export const joiVariables = () =>
  joi
    .object()
    .pattern(/[a-zA-Z][a-zA-Z0-9_\-]+/i, joiPrimitive())
    .default(() => ({}), "{}")
    .unknown(false)
    .description("Key/value map. Keys may contain letters and numbers, and values must be primitives.")

export const joiEnvVars = () =>
  joi
    .object()
    .pattern(envVarRegex, joiPrimitive())
    .default(() => ({}), "{}")
    .unknown(false)
    .description(
      "Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
        "(must not start with `GARDEN`) and values must be primitives."
    )

export const joiArray = (schema) =>
  joi
    .array()
    .items(schema)
    .default(() => [], "[]")

export const joiRepositoryUrl = () =>
  joi
    .alternatives(
      joi.string().gitUrl({ requireHash: true }),
      // Allow file URLs as well
      joi.string().uri({ scheme: ["file"] })
    )
    .description(
      "A remote repository URL. Currently only supports git servers. Must contain a hash suffix" +
        " pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>"
    )
    .example("git+https://github.com/org/repo.git#v2.0")

export const joiSchema = () =>
  joi
    .object({
      isJoi: joi
        .boolean()
        .only(true)
        .required(),
    })
    .unknown(true)

export function isPrimitive(value: any) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
}

const joiPathPlaceholder = uuid.v4()
const joiPathPlaceholderRegex = new RegExp(joiPathPlaceholder, "g")
const joiOptions = {
  abortEarly: false,
  language: {
    key: `key ${joiPathPlaceholder} `,
    object: {
      allowUnknown: `!!key "{{!child}}" is not allowed at path ${joiPathPlaceholder}`,
      child: '!!"{{!child}}": {{reason}}',
      xor: `!!object at ${joiPathPlaceholder} only allows one of {{peersWithLabels}}`,
    },
  },
}

export interface ValidateOptions {
  context?: string // Descriptive text to include in validation error messages, e.g. "module at some/local/path"
  ErrorClass?: typeof ConfigurationError | typeof LocalConfigError
}

export interface ValidateWithPathParams<T> {
  config: T
  schema: Joi.Schema
  path: string // Absolute path to the config file, including filename
  projectRoot: string
  name?: string // Name of the top-level entity that the config belongs to, e.g. "some-module" or "some-project"
  configType?: string // The type of top-level entity that the config belongs to, e.g. "module" or "project"
  ErrorClass?: typeof ConfigurationError | typeof LocalConfigError
}

/**
 * Should be used whenever a path to the corresponding config file is available while validating config
 * files.
 *
 * This is to ensure consistent error messages that include the relative path to the failing file.
 */
export function validateWithPath<T>({
  config,
  schema,
  path,
  projectRoot,
  name,
  configType = "module",
  ErrorClass,
}: ValidateWithPathParams<T>) {
  const validateOpts = {
    context: `${configType} ${name ? `'${name}' ` : ""}(${relative(projectRoot, path)}/garden.yml)`,
  }

  if (ErrorClass) {
    validateOpts["ErrorClass"] = ErrorClass
  }

  return <T>validate(config, schema, validateOpts)
}

export function validate<T>(
  value: T,
  schema: Joi.Schema,
  { context = "", ErrorClass = ConfigurationError }: ValidateOptions = {}
): T {
  const result = schema.validate(value, joiOptions)
  const error = result.error

  if (error) {
    const description = schema.describe()

    const errorDetails = error.details.map((e) => {
      // render the key path in a much nicer way
      let renderedPath = "."

      if (e.path.length) {
        renderedPath = ""
        let d = description

        for (const part of e.path) {
          if (d.children && d.children[part]) {
            renderedPath += "." + part
            d = d.children[part]
          } else if (d.patterns) {
            for (const p of d.patterns) {
              if (part.toString().match(new RegExp(p.regex.slice(1, -1)))) {
                renderedPath += `[${part}]`
                d = p.rule
                break
              }
            }
          } else {
            renderedPath += `[${part}]`
          }
        }
      }

      // a little hack to always use full key paths instead of just the label
      e.message = e.message.replace(joiPathPlaceholderRegex, chalk.underline(renderedPath || "."))

      return e
    })

    const msgPrefix = context ? `Error validating ${context}` : "Validation error"
    const errorDescription = errorDetails.map((e) => e.message).join(", ")

    throw new ErrorClass(`${msgPrefix}: ${errorDescription}`, {
      value,
      context,
      errorDescription,
      errorDetails,
    })
  }

  return result.value
}

export interface ArtifactSpec {
  source: string
  target?: string
}
