/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Schema, z, infer as inferZodType, ZodArray, ZodType } from "zod"
import { envVarRegex, identifierRegex, joiIdentifierDescription, userIdentifierRegex } from "./constants"
import { filter, includes } from "lodash"

// Add additional helpers and methods. See https://github.com/colinhacks/zod/issues/273#issuecomment-1434077058
// - metadata support for all schemas
// - unique() method for array schemas
type UniquenessComparator<T extends z.ZodTypeAny> = keyof any | ((v: T) => keyof any)

declare module "zod" {
  interface ZodType {
    getMetadata(): Record<string, any>
    setMetadata(meta: Record<string, any>): this
    getExample(): any
    example(value: any): this
  }

  interface ZodArray<T extends z.ZodTypeAny, Cardinality extends z.ArrayCardinality = "many"> {
    unique(comparator: UniquenessComparator<T>): z.ZodEffects<z.ZodArray<T, "many">, T["_output"][], T["_input"][]>
  }
}

Schema.prototype.getMetadata = function () {
  return this._def.meta
}
Schema.prototype.setMetadata = function (meta: Record<string, any>) {
  const This = (this as any).constructor
  return new This({
    ...this._def,
    meta,
  })
}
Schema.prototype.getExample = function () {
  return this._def.example
}
Schema.prototype.example = function (example: any) {
  // FIXME: This is hacky. We should handle examples for Zod schemas properly in docs generator.
  const exampleDescription = `Example: \`${JSON.stringify(example)}\``

  const This = (this as any).constructor
  return new This({
    ...this._def,
    example,
    description: this._def.description ? this._def.description + "\n\n" + exampleDescription : exampleDescription,
  })
}
Schema.prototype.describe = function (description: string) {
  this._def.description = description
  // Add example to description, if applicable
  const example = this.getExample()
  if (example) {
    this.example(example)
  }
  return this
}

ZodArray.prototype.unique = function (comparator: UniquenessComparator<any>) {
  return this.superRefine((value, ctx) => {
    const values =
      comparator === undefined
        ? value
        : typeof comparator === "function"
        ? value.map(comparator)
        : value.map((v) => v[comparator])

    const duplicates = filter(values, (val, i, iteratee) => includes(iteratee, val, i + 1))

    if (duplicates.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Found duplicate values in array: " + duplicates.join(","),
      })
    }
  })
}

// Add custom methods
// TODO: get to full parity with custom joi methods+types (just doing it gradually as needed for now)

export interface PosixPathOpts {
  absoluteOnly?: boolean
  allowGlobs?: boolean
  filenameOnly?: boolean
  relativeOnly?: boolean
  subPathOnly?: boolean
}

type GardenSchema = typeof z & {
  envVars: () => z.ZodRecord<z.ZodString, z.ZodString>
  posixPath: (opts?: PosixPathOpts) => z.ZodEffects<z.ZodString, string, string>
  identifier: () => z.ZodString
  userIdentifier: () => z.ZodString
  sparseArray: <T extends z.ZodTypeAny>(
    schema: T,
    params?: z.RawCreateParams
  ) => z.ZodEffects<z.ZodArray<T, "many">, T["_output"][], T["_input"][]>
  // jsonSchema: (schemaPath: string) => z.ZodTypeAny
}

// This should be imported instead of z because we augment zod with custom methods
export const s = z as GardenSchema
export type inferType<T extends ZodType<any, any, any>> = inferZodType<T>

export namespace s {
  export type infer<T extends z.ZodType<any, any, any>> = z.infer<T>
}

s.envVars = () => s.record(s.string().regex(envVarRegex).min(1), z.string())

s.posixPath = (opts: PosixPathOpts = {}) => {
  return z
    .string()
    .superRefine((value, ctx) => {
      if (opts.absoluteOnly && !value.startsWith("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Path must be absolute (i.e. start with /).`,
        })
      }
      if (!opts.allowGlobs && (value.includes("*") || value.includes("?"))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Path cannot include globs or wildcards.",
        })
      }
      if (opts.filenameOnly && value.includes("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a filename (may not contain slashes).",
        })
      }
      if (opts.relativeOnly && value.startsWith("/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a relative path (may not start with a slash).",
        })
      }
      if (opts.subPathOnly && value.includes("..")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a sub-path (may not include '..').",
        })
      }
    })
    .setMetadata({
      // Picked up when converting to joi schemas
      posixPath: opts,
    })
}

s.identifier = () => {
  return z
    .string({
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === "regex") {
          return { message: "Expected a valid identifier. Should be a " + joiIdentifierDescription }
        }
        return { message: ctx.defaultError }
      },
    })
    .regex(identifierRegex)
}

s.userIdentifier = () => {
  return z
    .string({
      errorMap: (issue, ctx) => {
        if (issue.code === z.ZodIssueCode.invalid_string && issue.validation === "regex") {
          return {
            message:
              "Expected a valid identifier (that also cannot start with 'garden'). Should be a " +
              joiIdentifierDescription,
          }
        }
        return { message: ctx.defaultError }
      },
    })
    .regex(userIdentifierRegex)
}

s.sparseArray = <T extends z.ZodTypeAny>(schema: T, params?: z.RawCreateParams) => {
  return s.array(schema, params).transform((value) => value.filter((v: any) => v !== undefined && v !== null))
}

// s.jsonSchema = <J extends z.ZodTypeAny>(schema: J) => {
// }
