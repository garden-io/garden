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

export class InternalError extends GardenError {
  type = "internal"
}

export class TimeoutError extends GardenError {
  type = "timeout"
}
