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
import {
  Module,
  ModuleConfig,
} from "../types/module"
import { LogSymbolType } from "../logger/types"
import {
  joiIdentifier,
  joiArray,
  validate,
  PrimitiveMap,
  joiPrimitive,
} from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import {
  GardenPlugin,
} from "../types/plugin"
import {
  BuildModuleParams,
  GetModuleBuildStatusParams,
  ParseModuleParams,
  PushModuleParams,
  RunServiceParams,
} from "../types/plugin/params"
import {
  baseServiceSchema,
  BaseServiceSpec,
  Service,
  ServiceConfig,
} from "../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../constants"
import { splitFirst } from "../util"
import { keyBy } from "lodash"
import {
  genericModuleSpecSchema,
  GenericModuleSpec,
  GenericTestSpec,
} from "./generic"

export interface ServiceEndpointSpec {
  paths?: string[]
  // TODO: support definition of hostnames on endpoints
  // hostname?: string
  port: string
}

export type ServicePortProtocol = "TCP" | "UDP"

export interface ServicePortSpec {
  name: string
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

export interface ContainerServiceSpec extends BaseServiceSpec {
  command: string[],
  daemon: boolean
  endpoints: ServiceEndpointSpec[],
  healthCheck?: ServiceHealthCheckSpec,
  ports: ServicePortSpec[],
  volumes: ServiceVolumeSpec[],
}

export type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>

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
    name: joiIdentifier().required(),
    protocol: Joi.string().allow("TCP", "UDP").default(DEFAULT_PORT_PROTOCOL),
    containerPort: Joi.number().required(),
    hostPort: Joi.number(),
    nodePort: Joi.number(),
  })
  .required()

const volumeSchema = Joi.object()
  .keys({
    name: joiIdentifier().required(),
    containerPath: Joi.string().required(),
    hostPath: Joi.string(),
  })

const serviceSchema = baseServiceSchema
  .keys({
    command: Joi.array().items(Joi.string()),
    daemon: Joi.boolean().default(false),
    endpoints: joiArray(endpointSchema),
    healthCheck: healthCheckSchema,
    ports: joiArray(portSchema).unique("name"),
    volumes: joiArray(volumeSchema).unique("name"),
  })

export interface ContainerModuleSpec extends GenericModuleSpec {
  buildArgs: PrimitiveMap,
  image?: string,
  services: ContainerServiceSpec[],
}

export type ContainerModuleConfig = ModuleConfig<ContainerModuleSpec>

export const containerModuleSpecSchema = genericModuleSpecSchema.keys({
  buildArgs: Joi.object().pattern(/.+/, joiPrimitive()).default(() => ({}), "{}"),
  image: Joi.string(),
  services: joiArray(serviceSchema).unique("name"),
})

export class ContainerService extends Service<ContainerModule> { }

export class ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends GenericTestSpec = GenericTestSpec,
  > extends Module<M, S, T> { }

export async function getImage(module: ContainerModule) {
  return module.spec.image
}

export const helpers = {
  async getLocalImageId(module: ContainerModule) {
    if (helpers.hasDockerfile(module)) {
      const { versionString } = await module.getVersion()
      return `${module.name}:${versionString}`
    } else {
      return getImage(module)
    }
  },

  async getRemoteImageId(module: ContainerModule) {
    // TODO: allow setting a default user/org prefix in the project/plugin config
    const image = await getImage(module)
    if (image) {
      let [imageName, version] = splitFirst(image, ":")

      if (version) {
        // we use the specified version in the image name, if specified
        // (allows specifying version on source images, and also setting specific version name when pushing images)
        return image
      } else {
        const { versionString } = await module.getVersion()
        return `${imageName}:${versionString}`
      }
    } else {
      return helpers.getLocalImageId(module)
    }
  },

  async pullImage(ctx: PluginContext, module: ContainerModule) {
    const identifier = await helpers.getRemoteImageId(module)

    ctx.log.info({ section: module.name, msg: `pulling image ${identifier}...` })
    await helpers.dockerCli(module, `pull ${identifier}`)
  },

  async imageExistsLocally(module: ContainerModule) {
    const identifier = await helpers.getLocalImageId(module)
    const exists = (await helpers.dockerCli(module, `images ${identifier} -q`)).stdout.trim().length > 0
    return exists ? identifier : null
  },

  async dockerCli(module: ContainerModule, args) {
    // TODO: use dockerode instead of CLI
    return childProcess.exec("docker " + args, { cwd: await module.getBuildPath(), maxBuffer: 1024 * 1024 })
  },

  hasDockerfile(module: ContainerModule) {
    return existsSync(join(module.path, "Dockerfile"))
  },
}

export async function parseContainerModule({ ctx, moduleConfig }: ParseModuleParams<ContainerModule>) {
  moduleConfig.spec = validate(moduleConfig.spec, containerModuleSpecSchema, { context: `module ${moduleConfig.name}` })

  // validate services
  const services: ContainerServiceConfig[] = moduleConfig.spec.services.map(spec => {
    // make sure ports are correctly configured
    const name = spec.name
    const definedPorts = spec.ports
    const portsByName = keyBy(spec.ports, "name")

    for (const endpoint of spec.endpoints) {
      const endpointPort = endpoint.port

      if (!portsByName[endpointPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${endpointPort} defined in endpoint`,
          { definedPorts, endpointPort },
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.httpGet) {
      const healthCheckHttpPort = spec.healthCheck.httpGet.port

      if (!portsByName[healthCheckHttpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
          { definedPorts, healthCheckHttpPort },
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.tcpPort) {
      const healthCheckTcpPort = spec.healthCheck.tcpPort

      if (!portsByName[healthCheckTcpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
          { definedPorts, healthCheckTcpPort },
        )
      }
    }

    return {
      name,
      dependencies: spec.dependencies,
      outputs: spec.outputs,
      spec,
    }
  })

  const tests = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
    variables: <PrimitiveMap>t.variables,
  }))

  const module = new ContainerModule(ctx, moduleConfig, services, tests)

  // make sure we can build the thing
  if (!(await getImage(module)) && !helpers.hasDockerfile(module)) {
    throw new ConfigurationError(
      `Module ${moduleConfig.name} neither specifies image nor provides Dockerfile`,
      {},
    )
  }

  return {
    module: moduleConfig,
    services,
    tests,
  }
}

// TODO: rename this plugin to docker
export const gardenPlugin = (): GardenPlugin => ({
  moduleActions: {
    container: {
      parseModule: parseContainerModule,

      async getModuleBuildStatus({ module, logEntry }: GetModuleBuildStatusParams<ContainerModule>) {
        const identifier = await helpers.imageExistsLocally(module)

        if (identifier) {
          logEntry && logEntry.debug({
            section: module.name,
            msg: `Image ${identifier} already exists`,
            symbol: LogSymbolType.info,
          })
        }

        return { ready: !!identifier }
      },

      async buildModule({ ctx, module, logEntry }: BuildModuleParams<ContainerModule>) {
        const buildPath = await module.getBuildPath()
        const dockerfilePath = join(buildPath, "Dockerfile")
        const image = await getImage(module)

        if (!!image && !existsSync(dockerfilePath)) {
          if (await helpers.imageExistsLocally(module)) {
            return { fresh: false }
          }
          logEntry && logEntry.setState(`Pulling image ${image}...`)
          await helpers.pullImage(ctx, module)
          return { fetched: true }
        }

        const identifier = await helpers.getLocalImageId(module)

        // build doesn't exist, so we create it
        logEntry && logEntry.setState(`Building ${identifier}...`)

        const buildArgs = Object.entries(module.spec.buildArgs).map(([key, value]) => {
          // TODO: may need to escape this
          return `--build-arg ${key}=${value}`
        }).join(" ")

        // TODO: log error if it occurs
        // TODO: stream output to log if at debug log level
        await helpers.dockerCli(module, `build ${buildArgs} -t ${identifier} ${buildPath}`)

        return { fresh: true, details: { identifier } }
      },

      async pushModule({ module, logEntry }: PushModuleParams<ContainerModule>) {
        if (!helpers.hasDockerfile(module)) {
          logEntry && logEntry.setState({ msg: `Nothing to push` })
          return { pushed: false }
        }

        const localId = await helpers.getLocalImageId(module)
        const remoteId = await helpers.getRemoteImageId(module)

        // build doesn't exist, so we create it
        logEntry && logEntry.setState({ msg: `Pushing image ${remoteId}...` })

        if (localId !== remoteId) {
          await helpers.dockerCli(module, `tag ${localId} ${remoteId}`)
        }

        // TODO: log error if it occurs
        // TODO: stream output to log if at debug log level
        // TODO: check if module already exists remotely?
        await helpers.dockerCli(module, `push ${remoteId}`)

        return { pushed: true }
      },

      async runService(
        { ctx, service, interactive, runtimeContext, silent, timeout }: RunServiceParams<ContainerModule>,
      ) {
        return ctx.runModule({
          moduleName: service.module.name,
          command: service.spec.command || [],
          interactive,
          runtimeContext,
          silent,
          timeout,
        })
      },
    },
  },
})
