import { ModuleHandler } from "./base"
import { ModuleConfig } from "../types/module-config"
import { identifierRegex } from "../types/common"
import * as Joi from "joi"

interface FunctionEndpointSpec {
  hostname: string
  path: string
}

interface FunctionModuleConfig extends ModuleConfig {
  functions?: {
    handler: string,
    endpoints?: FunctionEndpointSpec[],
  }
}

const functionsSchema = Joi.object()
  .pattern(identifierRegex, Joi.object()
  .keys({
    handler: Joi.string().required(),
    endpoints: Joi.array()
      .items(Joi.object().keys({
        hostname: Joi.string().hostname().required(),
        path: Joi.string().uri(<any>{ relativeOnly: true }).required(),
      })
      .required())
      .default(() => []),
  }))
  .default(() => [])

export class FunctionModule extends ModuleHandler<FunctionModuleConfig> {
  type = "function"

  validate(config: FunctionModuleConfig) {
    config.functions = functionsSchema.validate(config.functions).value

    // TODO: more function-specific validation
  }
}
