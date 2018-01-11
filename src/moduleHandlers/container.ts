import { ModuleHandler } from "./base"
import { ModuleConfig } from "../types/module-config"
import { identifierRegex } from "../types/common"
import * as Joi from "joi"

interface ServicePortSpec {
  container: number
  name?: string
}

interface ContainerModuleConfig extends ModuleConfig {
  services?: {
    command?: string,
    ports?: ServicePortSpec[],
  }
}

const servicesSchema = Joi.object()
  .pattern(identifierRegex, Joi.object()
  .keys({
    command: Joi.array().items(Joi.string()),
    ports: Joi.array()
      .items(
        Joi.object()
          .keys({
            container: Joi.number().required(),
            name: Joi.string(),
          })
          .required(),
      )
      .default(() => [], "[]"),
  }))
  .default(() => [], "[]")

export class ContainerModule extends ModuleHandler<ContainerModuleConfig> {
  type = "container"

  validate(config: ContainerModuleConfig) {
    config.services = servicesSchema.validate(config.services).value

    // TODO: more container-specific validation
  }
}
