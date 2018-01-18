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
  protocol: "TCP" | "UDP",
  name?: string
}

interface ContainerService {
  command?: string,
  ports: ServicePortSpec[],
  dependencies: string[],
}

export interface ContainerModuleConfig extends ModuleConfig {
  image?: string
  services: {
    [name: string]: ContainerService,
  }
}

const containerSchema = baseModuleSchema.keys({
  type: Joi.string().allow("container").required(),
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
              protocol: Joi.string().allow("TCP", "UDP"),
              name: Joi.string(),
            })
            .required(),
        )
          .default(() => [], "[]"),
      }))
    .default(() => [], "[]"),
})

export class ContainerModule extends Module<ContainerModuleConfig> {
  image?: string
  services?: {
    [name: string]: ContainerService,
  }

  constructor(context: GardenContext, config: ContainerModuleConfig) {
    super(context, config)

    this.image = config.image
    this.services = config.services || {}
  }

  async getImageId() {
    return this.image || `${this.name}:${await this.getVersion()}`
  }

  async pullImage(ctx: GardenContext) {
    const identifier = await this.getImageId()

    if (!await this.imageExistsLocally()) {
      ctx.log.info(this.name, `pulling image ${identifier}...`)
      await this.dockerCli(`pull ${identifier}`)
    }
  }

  async imageExistsLocally() {
    const identifier = await this.getImageId()
    return (await this.dockerCli(`images ${identifier} -q`)).stdout.trim().length > 0
  }

  async dockerCli(args) {
    // TODO: use dockerode instead of CLI
    return childProcess.exec("docker " + args, { cwd: this.path, maxBuffer: 1024 * 1024 })
  }
}

// TODO: support remote registries and pushing
export class ContainerModuleHandler extends Plugin<ContainerModule> {
  name = "container-module"
  supportedModuleTypes = ["container"]

  parseModule(context: GardenContext, config: ContainerModuleConfig) {
    config = <ContainerModuleConfig>Joi.attempt(config, containerSchema)

    const module = new ContainerModule(context, config)

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
    const ready = !!module.image ? true : await module.imageExistsLocally()

    if (ready) {
      this.context.log.verbose(module.name, `Image ${await module.getImageId()} already exists`)
    }

    return { ready }
  }

  async buildModule(module: ContainerModule) {
    const self = this

    if (!!module.image) {
      await module.pullImage(this.context)
      return { fetched: true }
    }

    const identifier = await module.getImageId()
    const name = module.name

    // build doesn't exist, so we create it
    const startTime = new Date().getTime()

    self.context.log.info(name, `building ${identifier}...`)

    // TODO: log error if it occurs
    await module.dockerCli(`build -t ${identifier} ${module.path}`)

    const buildTime = (new Date().getTime()) - startTime
    self.context.log.info(name, `built ${identifier} (took ${round(buildTime / 1000, 1)} sec)`)

    return { fresh: true }
  }
}
