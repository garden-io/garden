/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit } from "lodash"

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

export function toGardenError(err: Error | GardenError): GardenError {
  if (err instanceof GardenBaseError) {
    return err
  } else {
    const out = new RuntimeError(err.message, omit(err, ["message"]))
    out.stack = err.stack
    return out
  }
}

export class AuthenticationError extends GardenBaseError {
  type = "authentication"
}

export class ConfigurationError extends GardenBaseError {
  type = "configuration"
}

export class CommandError extends GardenBaseError {
  type = "command"
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

export class NotFoundError extends GardenBaseError {
  type = "not-found"
}
