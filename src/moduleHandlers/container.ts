import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { baseModuleSchema, baseServiceSchema, Module, ModuleConfig } from "../types/module"
import { identifierRegex } from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import { round } from "lodash"
import { Plugin } from "../types/plugin"
import { GardenContext } from "../context"

interface ServicePortSpec {
  container: number
  name?: string
}

export interface ContainerModuleConfig extends ModuleConfig {
  image?: string
  services?: {
    command?: string,
    ports?: ServicePortSpec[],
  }
}

const containerSchema = baseModuleSchema.keys({
  path: Joi.string().required(),
  image: Joi.string(),
  services: Joi.object()
    .pattern(identifierRegex, baseServiceSchema
      .keys({
        command: Joi.array().items(Joi.string()),
        ports: Joi.array().items(
          Joi.object()
            .keys({
              container: Joi.number().required(),
              name: Joi.string(),
            })
            .required(),
        )
          .default(() => [], "[]"),
      }))
    .default(() => [], "[]"),
})

class ContainerModule extends Module<ContainerModuleConfig> {
  image?: string
  services?: {
    command?: string,
    ports?: ServicePortSpec[],
  }
}

// TODO: support remote registries and pushing
export class ContainerModuleHandler extends Plugin<ContainerModuleConfig> {
  name = "container-module"
  supportedModuleTypes = ["container"]

  parseModule(context: GardenContext, config: ContainerModuleConfig) {
    config = <ContainerModuleConfig>Joi.attempt(config, containerSchema)

    const module = new ContainerModule(context, config)

    module.image = config.image
    module.services = config.services

    // make sure we can build the thing
    if (!module.image && !existsSync(join(module.path, "Dockerfile"))) {
      throw new ConfigurationError(
        `Module ${config.name} neither specified base image nor provides Dockerfile`,
        {},
      )
    }

    return module
  }

  async getModuleBuildStatus(module: ContainerModule) {
    const ready = !!module.image ? true : await this.imageExistsLocally(module)

    return { ready }
  }

  async buildModule(module: ContainerModule, { force = false } = {}) {
    const self = this

    if (!!module.image) {
      await this.pullImage(this.context, module)
      return { fetched: true }
    }

    const identifier = await this.getIdentifier(module)
    const name = module.name

    let build = async (doForce = false) => {
      if (doForce || !await self.getModuleBuildStatus(module)) {
        const startTime = new Date().getTime()

        self.context.log.info(name, `building ${identifier}...`)

        // TODO: log error if it occurs
        await this.dockerCli(module, `build -t ${identifier} ${module.path}`)

        const buildTime = (new Date().getTime()) - startTime
        self.context.log.info(name, `built ${identifier} (took ${round(buildTime / 1000, 1)} sec)`)

        return { fresh: true }
      } else {
        return {}
      }
    }

    if (force || !await this.imageExistsLocally(module)) {
      // build doesn't exist, so we create it
      return build(force)
    } else {
      return {}
    }
  }

  private async getIdentifier(module: ContainerModule) {
    return module.image || module.name
  }

  async pullImage(ctx: GardenContext, module: ContainerModule) {
    const identifier = await this.getIdentifier(module)

    if (!await this.imageExistsLocally(module)) {
      ctx.log.info(this.name, `pulling image ${identifier}...`)
      await this.dockerCli(module, `pull ${identifier}`)
    }
  }

  async imageExistsLocally(module: ContainerModule) {
    const identifier = await this.getIdentifier(module)
    return (await this.dockerCli(module, `images ${identifier} -q`)).stdout.trim().length > 0
  }

  async dockerCli(module: ContainerModule, args) {
    // TODO: use dockerode instead of CLI
    return childProcess.exec("docker " + args, { cwd: module.path, maxBuffer: 1024 * 1024 })
  }
}
