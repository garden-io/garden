import { baseServiceSchema, Module, ModuleConfig } from "../types/module"
import { identifierRegex } from "../types/common"
import * as Joi from "joi"
import { GardenContext } from "../context"
import { GenericModuleHandler } from "./generic"

interface FunctionEndpointSpec {
  hostname: string
  path: string
}

interface FunctionModuleConfig extends ModuleConfig {
  services: {
    handler: string,
    endpoints?: FunctionEndpointSpec[],
  }
}

const functionsServicesSchema = Joi.object()
  .pattern(identifierRegex, baseServiceSchema.keys({
    handler: Joi.string().required(),
    endpoints: Joi.array()
      .items(Joi.object().keys({
        hostname: Joi.string().hostname().required(),
        path: Joi.string().uri(<any>{ relativeOnly: true }).required(),
      }).required())
      .default(() => [], "[]"),
  }))
  .default(() => { }, "{}")

class FunctionModule extends Module<FunctionModuleConfig> {
  services: {
    handler: string,
    endpoints?: FunctionEndpointSpec[],
  }
}

export class GenericFunctionModuleHandler extends GenericModuleHandler {
  name = "generic-function-module"
  supportedModuleTypes = ["function"]

  parseModule(context: GardenContext, config: FunctionModuleConfig) {
    const module = new FunctionModule(context, config)

    module.services = Joi.attempt(config.services, functionsServicesSchema)

    return module
  }
}
