/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export abstract class GardenError extends Error {
  abstract type: string
  detail: any

  constructor(message: string, detail: object) {
    super(message)
    this.detail = detail
  }
}

export class ConfigurationError extends GardenError {
  type = "configuration"
}

export class ValidationError extends GardenError {
  type = "validation"
}

export class PluginError extends GardenError {
  type = "plugin"
}

export class ParameterError extends GardenError {
  type = "parameter"
}

export class NotImplementedError extends GardenError {
  type = "not-implemented"
}

export class DeploymentError extends GardenError {
  type = "deployment"
}

export class RuntimeError extends GardenError {
  type = "runtime"
}

export class InternalError extends GardenError {
  type = "internal"
}

export class TimeoutError extends GardenError {
  type = "timeout"
}

export class NotFoundError extends GardenError {
  type = "not-found"
}
