/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { PluginContext } from "../plugin-context"
import { baseModuleSchema, baseServiceSchema, Module, ModuleConfig } from "../types/module"
import { LogSymbolType } from "../logger/types"
import { identifierRegex, validate } from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import {
  BuildModuleParams,
  GetModuleBuildStatusParams,
  GardenPlugin,
  PushModuleParams,
  ParseModuleParams,
  RunServiceParams,
} from "../types/plugin"
import { Service } from "../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../constants"
import { splitFirst } from "../util"

export interface ServiceEndpointSpec {
  paths?: string[]
  // TODO: support definition of hostnames on endpoints
  // hostname?: string
  port: string
}

export type ServicePortProtocol = "TCP" | "UDP"

export interface ServicePortSpec {
  protocol: ServicePortProtocol
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

  constructor(ctx: PluginContext, config: T) {
    super(ctx, config)

    this.image = config.image
  }

  async getLocalImageId() {
    if (this.hasDockerfile()) {
      const { versionString } = await this.getVersion()
      return `${this.name}:${versionString}`
    } else {
      return this.image
    }
  }

  async getRemoteImageId() {
    // TODO: allow setting a default user/org prefix in the project/plugin config
    if (this.image) {
      let [imageName, version] = splitFirst(this.image, ":")

      if (version) {
        // we use the specified version in the image name, if specified
        // (allows specifying version on source images, and also setting specific version name when pushing images)
        return this.image
      } else {
        const { versionString } = await this.getVersion()
        return `${imageName}:${versionString}`
      }
    } else {
      return this.getLocalImageId()
    }
  }

  async pullImage(ctx: PluginContext) {
    const identifier = await this.getRemoteImageId()

    ctx.log.info({ section: this.name, msg: `pulling image ${identifier}...` })
    await this.dockerCli(`pull ${identifier}`)
  }

  async imageExistsLocally() {
    const identifier = await this.getLocalImageId()
    const exists = (await this.dockerCli(`images ${identifier} -q`)).stdout.trim().length > 0
    return exists ? identifier : null
  }

  async dockerCli(args) {
    // TODO: use dockerode instead of CLI
    return childProcess.exec("docker " + args, { cwd: await this.getBuildPath(), maxBuffer: 1024 * 1024 })
  }

  hasDockerfile() {
    return existsSync(join(this.path, "Dockerfile"))
  }
}

// TODO: rename this plugin to docker
export const gardenPlugin = (): GardenPlugin => ({
  moduleActions: {
    container: {
      async parseModule({ ctx, moduleConfig }: ParseModuleParams<ContainerModule>) {
        moduleConfig = validate(moduleConfig, containerSchema, { context: `module ${moduleConfig.name}` })

        const module = new ContainerModule(ctx, moduleConfig)

        // make sure we can build the thing
        if (!module.image && !module.hasDockerfile()) {
          throw new ConfigurationError(
            `Module ${moduleConfig.name} neither specifies image nor provides Dockerfile`,
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
      },

      async getModuleBuildStatus({ module, logEntry }: GetModuleBuildStatusParams<ContainerModule>) {
        const identifier = await module.imageExistsLocally()

        if (identifier) {
          logEntry && logEntry.debug({
            section: module.name,
            msg: `Image ${identifier} already exists`,
            symbol: LogSymbolType.info,
          })
        }

        return { ready: !!identifier }
      },

      async buildModule({ ctx, module, buildContext, logEntry }: BuildModuleParams<ContainerModule>) {
        const buildPath = await module.getBuildPath()
        const dockerfilePath = join(buildPath, "Dockerfile")

        if (!!module.image && !existsSync(dockerfilePath)) {
          if (await module.imageExistsLocally()) {
            return { fresh: false }
          }
          logEntry && logEntry.setState(`Pulling image ${module.image}...`)
          await module.pullImage(ctx)
          return { fetched: true }
        }

        const identifier = await module.getLocalImageId()

        // build doesn't exist, so we create it
        logEntry && logEntry.setState(`Building ${identifier}...`)

        const buildArgs = Object.entries(buildContext).map(([key, value]) => {
          // TODO: may need to escape this
          return `--build-arg ${key}=${value}`
        }).join(" ")

        // TODO: log error if it occurs
        // TODO: stream output to log if at debug log level
        await module.dockerCli(`build ${buildArgs} -t ${identifier} ${buildPath}`)

        return { fresh: true, details: { identifier } }
      },

      async pushModule({ module, logEntry }: PushModuleParams<ContainerModule>) {
        if (!module.hasDockerfile()) {
          logEntry && logEntry.setState({ msg: `Nothing to push` })
          return { pushed: false }
        }

        const localId = await module.getLocalImageId()
        const remoteId = await module.getRemoteImageId()

        // build doesn't exist, so we create it
        logEntry && logEntry.setState({ msg: `Pushing image ${remoteId}...` })

        if (localId !== remoteId) {
          await module.dockerCli(`tag ${localId} ${remoteId}`)
        }

        // TODO: log error if it occurs
        // TODO: stream output to log if at debug log level
        // TODO: check if module already exists remotely?
        await module.dockerCli(`push ${remoteId}`)

        return { pushed: true }
      },

      async runService(
        { ctx, service, interactive, runtimeContext, silent, timeout }: RunServiceParams<ContainerModule>,
      ) {
        return ctx.runModule({
          module: service.module,
          command: service.config.command || [],
          interactive,
          runtimeContext,
          silent,
          timeout,
        })
      },
    },
  },
})
