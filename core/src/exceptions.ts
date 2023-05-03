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
import { readFileSync } from "fs"
import chalk from "chalk"
import { highlightYaml } from "./util/serialization"

export type ErrorYamlFileContext = {
  absolutePath: string
  start: { line: number; col: number }
  end: { line: number; col: number}
}

function hasYamlFileContext (context: unknown): context is ErrorYamlFileContext {
  return (
    !!context &&
    (context as ErrorYamlFileContext).absolutePath !== undefined &&
    (context as ErrorYamlFileContext).start !== undefined &&
    (context as ErrorYamlFileContext).end !== undefined &&
    typeof (context as ErrorYamlFileContext).start.line === "number" &&
    typeof (context as ErrorYamlFileContext).start.col === "number" &&
    typeof (context as ErrorYamlFileContext).end.line === "number" &&
    typeof (context as ErrorYamlFileContext).end.col === "number"
  )
}

export interface GardenError<D extends object = any> extends Error {
  type: string
  message: string
  detail?: D
  stack?: string
}

export abstract class GardenBaseError<D extends object = any> extends Error implements GardenError<D> {
  abstract type: string

  constructor(message: string, public readonly detail: D, public readonly wrappedError?: Error) {
    super(message)
    this.detail = detail
  }

  toString() {
    if (testFlags.expandErrors) {
      let str = super.toString()

      if (this.wrappedError) {
        str += "\n\nWrapped error:\n\n" + this.wrappedError
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

  constructor(message: string, detail: any) {
    super(message + "\nThis is a bug. Please report it!", detail)
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

interface ErrorEvent {
  error: any
  message: string
}

export function toGardenError(err: Error | ErrorEvent | GardenBaseError | string): GardenBaseError {
  if (err instanceof GardenBaseError) {
    return err
  } else if (err instanceof Error) {
    const out = new RuntimeError(err.message, err)
    out.stack = err.stack
    return out
  } else if (!isString(err) && err.message && err.error) {
    return new RuntimeError(err.message, err)
  } else if (isString(err)) {
    return new RuntimeError(err, {})
  } else {
    const msg = err["message"]
    return new RuntimeError(msg, err)
  }
}

function filterErrorDetail(detail: any) {
  return withoutInternalFields(sanitizeValue(detail))
}

interface LineContext {
  before: string[]
  lines: string[]
  after: string[]
}

const getLineWithContext = function (fileLines: string[], linesStart: number, linesEnd: number, context: number): LineContext {
  const lines: number[] = []

  for (let i = linesStart; i <= linesEnd; i++) {
    // Lines start at 1, arrays at 0
    lines.push(i - 1)
  }

  const first = lines[0]
  const last = lines[lines.length - 1]

  const firstLine = first > context ? first - context : 0
  const lastLine = last + context < fileLines.length ? last + context : fileLines.length

  return {
    before: fileLines.slice(firstLine, first),
    lines: lines.map((lineNumber) => fileLines[lineNumber]),
    after: fileLines.slice(last + 1, lastLine + 1),
  }
}

function getYamlFileContext(error: GardenError, contextLines = 2): string | undefined {
  if (hasYamlFileContext(error.detail)) {
    const yamlFile = readFileSync(error.detail.absolutePath, "utf-8")
    const highlighted = highlightYaml(yamlFile)
    const fileLines = highlighted.split("\n")
    const context = getLineWithContext(fileLines, error.detail.start.line, error.detail.end.line, contextLines)

    const logLines = [...context.before, ...context.lines.map((line) => chalk.underline.bgRed(line)), ...context.after]
    const logLinesWithLineNumbers = logLines.map(
      (line, index) => `${chalk.dim.italic(error.detail.start.line - contextLines + index + 1)} ${line}`
    )
    return logLinesWithLineNumbers.join("\n")
  }

  return undefined
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

  const yamlFileContext = getYamlFileContext(error)
  if (yamlFileContext) {
    out += `\n\n${yamlFileContext}`
  }

  return out
}
