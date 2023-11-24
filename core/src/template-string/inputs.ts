/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Primitive, isPrimitive } from "utility-types"
import { ContextResolveOpts } from "../config/template-contexts/base.js"
import { InternalError } from "../exceptions.js"
import { isPlainObject } from "lodash-es"

export function isTemplatePrimitive(value: unknown): value is TemplatePrimitive {
  return (
    isPrimitive(value) ||
    (isPlainObject(value) && Object.keys(<object>value).length === 0) ||
    (Array.isArray(value) && value.length === 0)
  )
}

type EmptyArray = never[]
type EmptyObject = { [key: string]: never }

export type TemplatePrimitive =
  | Primitive
  // We need an instance of TemplateValue to wrap /empty/ Arrays and /empty/ Objects, so we can track their inputs.
  // If the array/object has elements, those will be wrapped in TemplateValue instances.
  | EmptyArray
  | EmptyObject

export function isTemplateValue(value: unknown): value is TemplateValue {
  return value instanceof TemplateValue
}

type TemplateInputs = {
  // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
  [contextKeyPath: string]: TemplateValue
}

export class TemplateValue<T extends TemplatePrimitive = TemplatePrimitive> {
  public readonly expr: string | undefined
  public readonly value: T
  public readonly inputs: TemplateInputs
  constructor({ expr, value, inputs }: { expr: string | undefined; value: T; inputs: TemplateInputs }) {
    this.expr = expr
    this.value = value
    this.inputs = inputs
  }
}

export type TemplateCollectionOrValue =
  | TemplateValue
  | Iterable<TemplateCollectionOrValue>
  | { [key: string]: TemplateCollectionOrValue }

// TODO: Remove the recorder
export class ReferenceRecorder {
  private references?: __ResolveReferences = {}

  record(contextOpts: ContextResolveOpts, result: TemplateValue) {
    if (!this.references) {
      throw new InternalError({ message: "Already collected references" })
    }

    if (!contextOpts.resultPath) {
      throw new InternalError({ message: "Missing resultPath" })
    }

    const key = contextOpts.resultPath.join(".")
    if (!this.references.hasOwnProperty(key)) {
      this.references[key] = result
    }
  }

  getReferences(): __ResolveReferences {
    if (!this.references) {
      throw new InternalError({ message: "Already collected references" })
    }
    const refs = this.references
    delete this.references
    return refs
  }
}

export type __ResolveReferences = {
  // key is the resolve result key path, e.g. "spec.files[0].path"
  [resultKeyPath: string]: TemplateValue
}
