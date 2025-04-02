/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isPlainObject, isString, mapValues, omit } from "lodash-es"
import stripAnsi from "strip-ansi"
import { isPrimitive } from "../config/common.js"
import { deepFilter } from "./objects.js"
import { InternalError } from "../exceptions.js"

let _callingToSanitizedValue = false

/**
 * Strips undefined values, internal objects and circular references from an object.
 */
export function sanitizeValue(value: any, _parents?: WeakSet<any>): any {
  if (_callingToSanitizedValue) {
    throw new InternalError({
      message: "`toSanitizedValue` is not allowed to call `sanitizeValue` because that can cause infinite recursion.",
    })
  }

  // TODO-DODDI-0.14: Remove this line once we've removed graphResults from ProcessCommandResult.
  if (isPlainObject(value) && "graphResults" in value) {
    value = omit(value, "graphResults")
  }

  if (!_parents) {
    _parents = new WeakSet()
  } else if (_parents.has(value)) {
    return "[Circular]"
  }

  if (value === null || value === undefined) {
    return value
  } else if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
    }
  } else if (Buffer.isBuffer(value)) {
    return "<Buffer>"
    // This is hacky but fairly reliably identifies a Joi schema object
  } else if (value.$_root) {
    // TODO: Identify the schema
    return "<JoiSchema>"
  } else if (value.isGarden) {
    return "<Garden>"
  } else if (isArray(value)) {
    _parents.add(value)
    const out = value.map((v) => sanitizeValue(v, _parents))
    _parents.delete(value)
    return out
  } else if (isPlainObject(value)) {
    _parents.add(value)
    const out = mapValues(value, (v) => sanitizeValue(v, _parents))
    _parents.delete(value)
    return out
  } else if (!isPrimitive(value) && value.constructor) {
    // Looks to be a class instance
    if (value.toSanitizedValue) {
      // Special allowance for internal objects
      try {
        _callingToSanitizedValue = true
        return value.toSanitizedValue()
      } finally {
        _callingToSanitizedValue = false
      }
    } else {
      // Any other class. Convert to plain object and sanitize attributes.
      _parents.add(value)
      const out = mapValues({ ...value }, (v) => sanitizeValue(v, _parents))
      _parents.delete(value)
      return out
    }
  } else if (isString(value)) {
    return stripAnsi(value)
  } else {
    return value
  }
}

// Recursively filters out internal fields, including keys starting with _ and some specific fields found on Modules.
export function withoutInternalFields(object: any): any {
  return deepFilter(object, (_val, key: string | number) => {
    if (typeof key === "string") {
      return (
        !key.startsWith("_") &&
        // FIXME: this a little hacky and should be removable in 0.14 at the latest.
        // The buildDependencies map on Module objects explodes outputs, as well as the dependencyVersions field on
        // version objects.
        key !== "dependencyVersions" &&
        key !== "dependencyResults" &&
        key !== "buildDependencies"
      )
    }
    return true
  })
}
