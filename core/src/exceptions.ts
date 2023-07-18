/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isEmpty, isString } from "lodash"
import { stringify } from "yaml"
import { withoutInternalFields, sanitizeValue } from "./util/logging"
import { testFlags } from "./util/util"

export interface GardenError<D extends object = any> extends Error {
  type: string
  message: string
  detail?: D
  stack?: string
  wrappedErrors?: GardenError[]
  context?: GardenErrorContext
}

export function isGardenError(err: any): err is GardenError {
  return "type" in err && "message" in err
}

export type StackTraceMetadata = {
  functionName: string
  relativeFileName?: string
  lineNumber?: number
}

export type GardenErrorStackTrace = {
  metadata: StackTraceMetadata[]
  wrappedMetadata?: StackTraceMetadata[][]
}

export interface GardenErrorParams<D extends object = any> {
  message: string
  readonly detail?: D
  readonly stack?: string
  readonly wrappedErrors?: GardenError[]
  readonly context?: GardenErrorContext
}

export type GardenErrorContext = {
  taskType?: string
}

export abstract class GardenBaseError<D extends object = any> extends Error implements GardenError<D> {
  abstract type: string
  public override message: string
  public detail?: D
  public wrappedErrors?: GardenError<any>[]
  public context?: GardenErrorContext

  constructor({ message, detail, stack, wrappedErrors, context }: GardenErrorParams<D>) {
    super(message)
    this.detail = detail
    this.stack = stack || this.stack
    this.wrappedErrors = wrappedErrors
    this.context = context
  }

  override toString() {
    if (testFlags.expandErrors) {
      let str = super.toString()

      if (this.wrappedErrors) {
        str += "\n\nWrapped error:\n\n"

        for (const wrappedError in this.wrappedErrors) {
          str += wrappedError + "\n\n"
        }
      }

      return str
    } else {
      return super.toString()
    }
  }

  toSanitizedValue() {
    return {
      type: this.type,
      message: this.message,
      stack: this.stack,
      detail: filterErrorDetail(this.detail),
    }
  }

  formatWithDetail() {
    return formatGardenErrorWithDetail(this)
  }
}

export class AuthenticationError extends GardenBaseError {
  type = "authentication"
}

export class BuildError extends GardenBaseError {
  type = "build"
}

export class ConfigurationError extends GardenBaseError {
  type = "configuration"
}

export class CommandError extends GardenBaseError {
  type = "command"
}

export class FilesystemError extends GardenBaseError {
  type = "filesystem"
}

export class LocalConfigError extends GardenBaseError {
  type = "local-config"
}

export class ValidationError extends GardenBaseError {
  type = "validation"
}

export class PluginError extends GardenBaseError {
  type = "plugin"
}

export class ParameterError extends GardenBaseError {
  type = "parameter"
}

export class NotImplementedError extends GardenBaseError {
  type = "not-implemented"
}

export class DeploymentError extends GardenBaseError {
  type = "deployment"
}

export class RuntimeError extends GardenBaseError {
  type = "runtime"
}

export class InternalError extends GardenBaseError {
  type = "internal"

  constructor({ message, detail }: { message: string; detail: any }) {
    super({ message: message + "\nThis is a bug. Please report it!", detail })
  }
}

export class TimeoutError extends GardenBaseError {
  type = "timeout"
}

export class OutOfMemoryError extends GardenBaseError {
  type = "out-of-memory"
}

export class NotFoundError extends GardenBaseError {
  type = "not-found"
}

export class WorkflowScriptError extends GardenBaseError {
  type = "workflow-script"
}

export class CloudApiError extends GardenBaseError {
  type = "cloud-api"
}

export class TemplateStringError extends GardenBaseError {
  type = "template-string"
}

export class WrappedNativeError extends GardenBaseError {
  type = "wrapped-native-error"

  constructor(error: Error) {
    super({ message: error.message, stack: error.stack })
  }
}

export function toGardenError(err: Error | GardenBaseError | string): GardenBaseError {
  if (err instanceof GardenBaseError) {
    return err
  } else if (err instanceof Error) {
    const wrappedError = new WrappedNativeError(err)
    const out = new RuntimeError({ message: err.message, wrappedErrors: [wrappedError] })
    out.stack = err.stack
    return out
  } else if (isString(err)) {
    return new RuntimeError({ message: err })
  } else {
    const msg = err["message"]
    return new RuntimeError({ message: msg })
  }
}

function filterErrorDetail(detail: any) {
  return withoutInternalFields(sanitizeValue(detail))
}

export function formatGardenErrorWithDetail(error: GardenError) {
  const { detail, message, stack } = error
  let out = stack || message || ""

  // We sanitize and recursively filter out internal fields (i.e. having names starting with _).
  const filteredDetail = filterErrorDetail(detail)

  if (!isEmpty(filteredDetail)) {
    try {
      const yamlDetail = stringify(filteredDetail, { blockQuote: "literal", lineWidth: 0 })
      out += `\n\nError Details:\n\n${yamlDetail}`
    } catch (err) {
      out += `\n\nUnable to render error details:\n${err.message}`
    }
  }
  return out
}

function getStackTraceFromString(stack: string): StackTraceMetadata[] {
  // Care about the first line matching our code base
  const lines = stack.split("\n").slice(1)

  return lines.flatMap((l) => {
    // match and extract any line from a stack trace with
    // function, file path, line number, column number
    // we are only interested in the first two for now
    const atLine = l.match(/at (?:(.+?)\s+\()?(?:(.+?):(\d+)(?::(\d+))?|([^)]+))\)?/)

    // ignore this if there is no regex match
    if (!atLine) {
      return []
    }

    const functionName: string = atLine[1] || "<unknown>"
    const filePath = atLine[2] || ""
    let lastFilePos = -1
    let tmpPos = -1

    // Get the slice offset assuming the file path contains a known
    // path component in the source file path.
    if ((tmpPos = filePath.lastIndexOf("src")) > -1) {
      lastFilePos = tmpPos + 4
    } else if ((tmpPos = filePath.lastIndexOf("node_modules")) > -1) {
      lastFilePos = tmpPos + 13
    } else if ((tmpPos = filePath.lastIndexOf("node:internal")) > -1) {
      lastFilePos = tmpPos + 14
    }

    let relativeFileName: string | undefined = undefined

    if (lastFilePos > -1) {
      relativeFileName = filePath.slice(lastFilePos)
    }

    let lineNumber = parseInt(atLine[3], 10) || -1

    return [
      {
        functionName,
        relativeFileName,
        lineNumber,
      },
    ]
  })
}

export function getStackTraceMetadata(error: GardenError): GardenErrorStackTrace {
  if (!error.stack && !error.wrappedErrors) {
    return { metadata: [], wrappedMetadata: undefined }
  }

  const errorMetadata: StackTraceMetadata[] = error.stack ? getStackTraceFromString(error.stack) : []

  const wrappedMetadata: StackTraceMetadata[][] | undefined = error.wrappedErrors?.map((wrappedError) => {
    if (!wrappedError.stack) {
      return []
    }

    return getStackTraceFromString(wrappedError.stack)
  })

  return {
    metadata: errorMetadata,
    wrappedMetadata,
  }
}
