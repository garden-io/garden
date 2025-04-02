/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenError } from "../exceptions.js"
import { getStackTraceMetadata } from "../exceptions.js"
import type { AnalyticsGardenError, AnalyticsGardenErrorDetail } from "./analytics.js"

function getErrorDetail(error: GardenError): AnalyticsGardenErrorDetail {
  const stackTrace = getStackTraceMetadata(error)
  const firstEntry = stackTrace.metadata.at(0)

  return {
    errorType: error.type,
    taskType: error.taskType,
    code: error.code,
    stackTrace: firstEntry,
  }
}

function getLeafErrors(error: GardenError): AnalyticsGardenErrorDetail[] {
  if (!error.wrappedErrors || error.wrappedErrors.length === 0) {
    return [getErrorDetail(error)]
  } else {
    return error.wrappedErrors.flatMap(getLeafErrors)
  }
}

function getAnalyticsError(error: GardenError): AnalyticsGardenError {
  let wrapped: AnalyticsGardenErrorDetail | undefined = undefined

  const { wrappedErrors } = error
  if (wrappedErrors && wrappedErrors.length > 0) {
    const firstError = wrappedErrors.at(0)
    if (firstError) {
      wrapped = getErrorDetail(firstError)
    }
  }

  return {
    // details of the root error
    error: getErrorDetail(error),
    // the first wrapped error
    wrapped,
    // recursively get all the leaf errors and select the first one
    leaf: error.wrappedErrors ? getLeafErrors(error).at(0) : undefined,
  }
}

export function getResultErrorProperties(errors: GardenError[]): {
  errors: string[]
  lastError?: AnalyticsGardenError
} {
  const allErrorMetadata: AnalyticsGardenError[] = errors.flatMap(getAnalyticsError)

  // capture the unique top level errors
  const allErrors = [
    ...new Set<string>(
      allErrorMetadata.map((e) => {
        return e.error.errorType
      })
    ),
  ]

  return {
    errors: allErrors,
    lastError: allErrorMetadata.at(-1),
  }
}
