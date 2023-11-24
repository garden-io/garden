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

// TODO: remove this type once we removed the recorder
export type ResolveReferences = {
  // key is the resolve result key path, e.g. "spec.files[0].path"
  [resultKeyPath: string]: ResolvedValue
}

export function isResolvedPrimitive(value: unknown): value is ResolvedPrimitive {
  return (
    value === undefined ||
    isPrimitive(value) ||
    (isPlainObject(value) && Object.keys(<object>value).length === 0) ||
    (Array.isArray(value) && value.length === 0)
  )
}

// We need to be able to track inputs even when there are no values, so empty collections must be a Primitive in the ResolvedValue type.
export type ResolvedPrimitive = Primitive | undefined | { [key: string]: never } | never[]

export function isResolvedValue(value: unknown): value is ResolvedValue {
  return value instanceof ResolvedValue
}

type TemplateInputs = {
  // key is the input variable name, e.g. secrets.someSecret, local.env.SOME_VARIABLE, etc
  [contextKeyPath: string]: ResolvedValue
}

export class ResolvedValue<T extends ResolvedPrimitive = ResolvedPrimitive> {
  public readonly expr: string | undefined
  public readonly value: T
  public readonly inputs: TemplateInputs
  constructor({ expr, value, inputs }: { expr: string | undefined, value: T, inputs: TemplateInputs }) {
    this.expr = expr
    this.value = value
    this.inputs = inputs
  }
}

export type ResolvedResult = ResolvedValue | Iterable<ResolvedResult> | { [key: string]: ResolvedResult }

export class ReferenceRecorder {
  private references?: ResolveReferences = {}

  record(contextOpts: ContextResolveOpts, result: ResolvedValue) {
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

  getReferences(): ResolveReferences {
    if (!this.references) {
      throw new InternalError({ message: "Already collected references" })
    }
    const refs = this.references
    delete this.references
    return refs
  }
}
