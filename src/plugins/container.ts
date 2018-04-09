/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { baseModuleSchema, baseServiceSchema, Module, ModuleConfig } from "../types/module"
import { LogSymbolType } from "../logger/types"
import { identifierRegex } from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import { BuildModuleParams, GetModuleBuildStatusParams, Plugin } from "../types/plugin"
import { GardenContext } from "../context"
import { Service } from "../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../constants"

export interface ServiceEndpointSpec {
  paths?: string[]
  // TODO: support definition of hostnames on endpoints
  // hostname?: string
  port: string
}

export interface ServicePortSpec {
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

export interface ServiceHealthCheckSpec {
  httpGet?: {
    path: string,
    port: string,
    scheme?: "HTTP" | "HTTPS",
  },
  command?: string[],
  tcpPort?: string,
}

export interface ContainerServiceConfig {
  command?: string[],
  daemon: boolean
  dependencies: string[],
  endpoints: ServiceEndpointSpec[],
  healthCheck?: ServiceHealthCheckSpec,
  ports: { [portName: string]: ServicePortSpec },
  volumes: ServiceVolumeSpec[],
}

export interface ContainerModuleConfig
  <T extends ContainerServiceConfig = ContainerServiceConfig>
  extends ModuleConfig<T> {
  image?: string
}

const endpointSchema = Joi.object()
  .keys({
    paths: Joi.array().items(Joi.string().uri(<any>{ relativeOnly: true })),
    // hostname: Joi.string(),
    port: Joi.string().required(),
  })

const healthCheckSchema = Joi.object()
  .keys({
    httpGet: Joi.object().keys({
      path: Joi.string().required(),
      port: Joi.string().required(),
      scheme: Joi.string().allow("HTTP", "HTTPS").default("HTTP"),
    }),
    command: Joi.array().items(Joi.string()),
    tcpPort: Joi.string(),
  }).xor("httpGet", "command", "tcpPort")

const portSchema = Joi.object()
  .keys({
    protocol: Joi.string().allow("TCP", "UDP").default(DEFAULT_PORT_PROTOCOL),
    containerPort: Joi.number().required(),
    hostPort: Joi.number(),
    nodePort: Joi.number(),
  })
  .required()

const volumeSchema = Joi.object()
  .keys({
    name: Joi.string().required(),
    containerPath: Joi.string().required(),
    hostPath: Joi.string(),
  })

const serviceSchema = baseServiceSchema
  .keys({
    command: Joi.array().items(Joi.string()),
    daemon: Joi.boolean().default(false),
    endpoints: Joi.array().items(endpointSchema).default(() => [], "[]"),
    healthCheck: healthCheckSchema,
    ports: Joi.object().pattern(identifierRegex, portSchema).default(() => ({}), "{}"),
    volumes: Joi.array().items(volumeSchema).default(() => [], "[]"),
  })

const containerSchema = baseModuleSchema.keys({
  type: Joi.string().allow("container").required(),
  path: Joi.string().required(),
  image: Joi.string(),
  services: Joi.object().pattern(identifierRegex, serviceSchema).default(() => ({}), "{}"),
})

export class ContainerService extends Service<ContainerModule> { }

export class ContainerModule<T extends ContainerModuleConfig = ContainerModuleConfig> extends Module<T> {
  image?: string

  constructor(ctx: GardenContext, config: T) {
    super(ctx, config)

    this.image = config.image
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
    return childProcess.exec("docker " + args, { cwd: await this.getBuildPath(), maxBuffer: 1024 * 1024 })
  }
}

// TODO: support remote registries and pushing
export class ContainerModuleHandler implements Plugin<ContainerModule> {
  name = "container-module"
  supportedModuleTypes = ["container"]

  async parseModule({ ctx, config }: { ctx: GardenContext, config: ContainerModuleConfig }) {
    config = <ContainerModuleConfig>Joi.attempt(config, containerSchema)

    const module = new ContainerModule(ctx, config)

    // make sure we can build the thing
    if (!module.image && !existsSync(join(module.path, "Dockerfile"))) {
      throw new ConfigurationError(
        `Module ${config.name} neither specified base image nor provides Dockerfile`,
        {},
      )
    }

    // validate services
    for (const [name, service] of Object.entries(module.services)) {
      // make sure ports are correctly configured
      const definedPorts = Object.keys(service.ports)

      for (const endpoint of service.endpoints) {
        const endpointPort = endpoint.port

        if (!service.ports[endpointPort]) {
          throw new ConfigurationError(
            `Service ${name} does not define port ${endpointPort} defined in endpoint`,
            { definedPorts, endpointPort },
          )
        }
      }

      if (service.healthCheck && service.healthCheck.httpGet) {
        const healthCheckHttpPort = service.healthCheck.httpGet.port

        if (!service.ports[healthCheckHttpPort]) {
          throw new ConfigurationError(
            `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
            { definedPorts, healthCheckHttpPort },
          )
        }
      }

      if (service.healthCheck && service.healthCheck.tcpPort) {
        const healthCheckTcpPort = service.healthCheck.tcpPort

        if (!service.ports[healthCheckTcpPort]) {
          throw new ConfigurationError(
            `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
            { definedPorts, healthCheckTcpPort },
          )
        }
      }
    }

    return module
  }

  async getModuleBuildStatus({ ctx, module }: GetModuleBuildStatusParams<ContainerModule>) {
    const ready = !!module.image ? true : await module.imageExistsLocally()

    if (ready) {
      ctx.log.debug({
        section: module.name,
        msg: `Image ${await module.getImageId()} already exists`,
        symbol: LogSymbolType.info,
      })
    }

    return { ready }
  }

  async buildModule({ ctx, module, logEntry }: BuildModuleParams<ContainerModule>) {
    if (!!module.image) {
      logEntry && logEntry.setState({ msg: `Fetching image ${module.image}...` })
      await module.pullImage(ctx)
      return { fetched: true }
    }

    const identifier = await module.getImageId()

    // build doesn't exist, so we create it
    logEntry && logEntry.setState({ msg: `Building ${identifier}...` })

    // TODO: log error if it occurs
    // TODO: stream output to log if at debug log level
    await module.dockerCli(`build -t ${identifier} ${await module.getBuildPath()}`)

    return { fresh: true }
  }
}
