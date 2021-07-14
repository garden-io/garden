/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isString, omit } from "lodash"

export interface GardenError {
  type: string
  message: string
  detail?: any
  stack?: string
}

export abstract class GardenBaseError extends Error implements GardenError {
  abstract type: string
  detail: any

  constructor(message: string, detail: object) {
    super(message)
    this.detail = detail
  }
}

export function toGardenError(err: Error | ErrorEvent | GardenBaseError | string): GardenBaseError {
  if (err instanceof GardenBaseError) {
    return err
  } else if (err instanceof Error) {
    const out = new RuntimeError(err.message, err)
    out.stack = err.stack
    return out
  } else if (err instanceof ErrorEvent) {
    return new RuntimeError(err.message, err)
  } else if (isString(err)) {
    return new RuntimeError(err, {})
  } else {
    const msg = err["message"]
    return new RuntimeError(msg, err)
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

export class EnterpriseApiError extends GardenBaseError {
  type = "enterprise-api"
}

export class TemplateStringError extends GardenBaseError {
  type = "template-string"
}
