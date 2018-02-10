import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { baseModuleSchema, baseServiceSchema, Module, ModuleConfig } from "../types/module"
import { LogSymbolType } from "../log"
import { identifierRegex } from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import { round } from "lodash"
import { Plugin } from "../types/plugin"
import { GardenContext } from "../context"
import { Service } from "../types/service"

export interface ServiceEndpointSpec {
  paths?: string[]
  hostname?: string
  containerPort: number
}

export interface ServicePortSpec {
  name?: string
  protocol: "TCP" | "UDP"
  containerPort: number
  hostPort?: number
  nodePort?: number
}

export interface ServiceVolumeSpec {
  name: string
  containerPath: string
  hostPath?: string
}

interface ServiceHealthCheckSpec {
  httpGet?: {
    path: string,
    port: number,
    scheme?: "HTTP" | "HTTPS",
  },
  command?: string[],
  tcpPort?: number,
}

export interface ContainerServiceConfig {
  command?: string,
  daemon: boolean
  dependencies: string[],
  endpoints: ServiceEndpointSpec[],
  healthCheck?: ServiceHealthCheckSpec,
  ports: ServicePortSpec[],
  volumes: ServiceVolumeSpec[],
}

export interface ContainerModuleConfig extends ModuleConfig {
  image?: string
  services: {
    [name: string]: ContainerServiceConfig,
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
        daemon: Joi.boolean().default(false),
        endpoints: Joi.array().items(Joi.object().keys({
          paths: Joi.array().items(Joi.string().uri(<any>{ relativeOnly: true })),
          hostname: Joi.string(),
          containerPort: Joi.number().required(),
        }))
          .default(() => [], "[]"),
        healthCheck: Joi.object().keys({
          httpGet: Joi.object().keys({
            path: Joi.string().required(),
            port: Joi.number().required(),
            scheme: Joi.string().allow("HTTP", "HTTPS").default("HTTP"),
          }),
          command: Joi.array().items(Joi.string()),
          tcpPort: Joi.number(),
        }),
        ports: Joi.array().items(
          Joi.object()
            .keys({
              name: Joi.string(),
              protocol: Joi.string().allow("TCP", "UDP"),
              containerPort: Joi.number().required(),
              hostPort: Joi.number(),
              nodePort: Joi.number(),
            })
            .required(),
        )
          .default(() => [], "[]"),
        volumes: Joi.array().items(
          Joi.object()
            .keys({
              name: Joi.string().required(),
              containerPath: Joi.string().required(),
              hostPath: Joi.string(),
            })
            .required(),
        )
          .default(() => [], "[]"),
      }))
    .default(() => [], "[]"),
})

export type ContainerService = Service<ContainerModule>

export class ContainerModule extends Module<ContainerModuleConfig> {
  image?: string
  services: {
    [name: string]: ContainerServiceConfig,
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
      ctx.log.info({ section: this.name, msg: `pulling image ${identifier}...` })
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

  parseModule({ context, config }: { context: GardenContext, config: ContainerModuleConfig }) {
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

  async getModuleBuildStatus({ module }: { module: ContainerModule }) {
    const ready = !!module.image ? true : await module.imageExistsLocally()

    if (ready) {
      this.context.log.debug({
        section: module.name,
        msg: `Image ${await module.getImageId()} already exists`,
        symbol: LogSymbolType.info,
      })
    }

    return { ready }
  }

  async buildModule({ module }: { module: ContainerModule }) {
    const self = this

    if (!!module.image) {
      await module.pullImage(this.context)
      return { fetched: true }
    }

    const identifier = await module.getImageId()
    const name = module.name

    // build doesn't exist, so we create it
    const startTime = new Date().getTime()

    self.context.log.info({ section: name, msg: `building ${identifier}...` })

    // TODO: log error if it occurs
    // TODO: stream output to log if at debug log level
    await module.dockerCli(`build -t ${identifier} ${module.path}`)

    const buildTime = (new Date().getTime()) - startTime
    self.context.log.info({ section: name, msg: `built ${identifier} (took ${round(buildTime / 1000, 1)} sec)` })

    return { fresh: true }
  }
}
