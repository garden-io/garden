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
