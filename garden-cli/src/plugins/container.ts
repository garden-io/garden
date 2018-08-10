/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { Module } from "../types/module"
import { LogSymbolType } from "../logger/types"
import {
  joiEnvVars,
  joiIdentifier,
  joiArray,
  validate,
  PrimitiveMap,
  joiPrimitive,
} from "../config/common"
import { pathExists } from "fs-extra"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import {
  GardenPlugin,
} from "../types/plugin/plugin"
import {
  BuildModuleParams,
  GetModuleBuildStatusParams,
  ParseModuleParams,
  PushModuleParams,
  RunServiceParams,
} from "../types/plugin/params"
import { Service, endpointDomainSchema, endpointSubdomainSchema } from "../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../constants"
import { splitFirst } from "../util/util"
import { keyBy } from "lodash"
import { genericTestSchema, GenericTestSpec } from "./generic"
import { ModuleSpec, ModuleConfig } from "../config/module"
import { BaseServiceSpec, ServiceConfig, baseServiceSchema } from "../config/service"

export interface ContainerEndpointSpec {
  path: string
  domain?: string
  subdomain?: string | null
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
  endpoints: ContainerEndpointSpec[],
  env: PrimitiveMap,
  healthCheck?: ServiceHealthCheckSpec,
  ports: ServicePortSpec[],
  volumes: ServiceVolumeSpec[],
}

export type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>

const endpointSchema = Joi.object()
  .keys({
    domain: endpointDomainSchema,
    subdomain: endpointSubdomainSchema,
    path: Joi.string().uri(<any>{ relativeOnly: true })
      .default("/")
      .description("The path which should be routed to the service."),
    port: Joi.string()
      .required()
      .description("The name of the container port where the specified paths should be routed."),
  })

const healthCheckSchema = Joi.object()
  .keys({
    httpGet: Joi.object()
      .keys({
        path: Joi.string()
          .uri(<any>{ relativeOnly: true })
          .required()
          .description("The path of the service's health check endpoint."),
        port: Joi.string()
          .required()
          .description("The name of the port where the service's health check endpoint should be available."),
        scheme: Joi.string().allow("HTTP", "HTTPS").default("HTTP"),
      })
      .description("Set this to check the service's health by making an HTTP request"),
    command: Joi.array().items(Joi.string())
      .description("Set this to check the service's health by running a command in its container."),
    tcpPort: Joi.string()
      .description("Set this to check the service's health by checking if this TCP port is accepting connections."),
  }).xor("httpGet", "command", "tcpPort")

const portSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the port (used when referencing the port elsewhere in the service configuration."),
    protocol: Joi.string()
      .allow("TCP", "UDP")
      .default(DEFAULT_PORT_PROTOCOL)
      .description("The protocol of the service container port."),
    containerPort: Joi.number()
      .required()
      .description("The port number on the service container."),
    hostPort: Joi.number()
      .meta({ deprecated: true }),
    nodePort: Joi.number()
      .description(
        "Set this to expose the service on the specified port on the host node " +
        "(may not be supported by all providers).",
    ),
  })
  .required()

const volumeSchema = Joi.object()
  .keys({
    name: joiIdentifier()
      .required()
      .description("The name of the allocated volume."),
    containerPath: Joi.string()
      .required()
      .description("The path where the volume should be mounted in the container."),
    hostPath: Joi.string()
      .meta({ deprecated: true }),
  })

const serviceSchema = baseServiceSchema
  .keys({
    command: Joi.array().items(Joi.string())
      .description("The arguments to run the container with when starting the service."),
    daemon: Joi.boolean()
      .default(false)
      .description("Whether to run the service as a daemon (to ensure only one runs per node)."),
    endpoints: joiArray(endpointSchema)
      .description("List of endpoints that the service exposes."),
    env: joiEnvVars(),
    healthCheck: healthCheckSchema
      .description("Specify how the service's health should be checked after deploying."),
    ports: joiArray(portSchema)
      .unique("name")
      .description("List of ports that the service container exposes."),
    volumes: joiArray(volumeSchema)
      .unique("name")
      .description("List of volumes that should be mounted when deploying the container."),
  })

export interface ContainerService extends Service<ContainerModule> { }

export interface ContainerTestSpec extends GenericTestSpec { }

export const containerTestSchema = genericTestSchema

export interface ContainerModuleSpec extends ModuleSpec {
  buildArgs: PrimitiveMap,
  image?: string,
  services: ContainerServiceSpec[],
  tests: ContainerTestSpec[],
}

export type ContainerModuleConfig = ModuleConfig<ContainerModuleSpec>

export const containerModuleSpecSchema = Joi.object()
  .keys({
    buildArgs: Joi.object()
      .pattern(/.+/, joiPrimitive())
      .default(() => ({}), "{}")
      .description("Specify build arguments when building the container image."),
    // TODO: validate the image name format
    image: Joi.string()
      .description(
        "Specify the image name for the container. Should be a valid docker image identifier. If specified and " +
        "the module does not contain a Dockerfile, this image will be used to deploy the container services. " +
        "If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.",
    ),
    services: joiArray(serviceSchema)
      .unique("name")
      .description("List of services to deploy from this container module."),
    tests: joiArray(containerTestSchema)
      .description("A list of tests to run in the module."),
  })
  .description("Configuration for a container module.")

export interface ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  > extends Module<M, S, T> { }

export async function getImage(module: ContainerModule) {
  return module.spec.image
}

export const helpers = {
  async getLocalImageId(module: ContainerModule) {
    if (await helpers.hasDockerfile(module)) {
      const { versionString } = await module.version
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
        const { versionString } = await module.version
        return `${imageName}:${versionString}`
      }
    } else {
      return helpers.getLocalImageId(module)
    }
  },

  async pullImage(module: ContainerModule) {
    const identifier = await helpers.getRemoteImageId(module)
    await helpers.dockerCli(module, `pull ${identifier}`)
  },

  async imageExistsLocally(module: ContainerModule) {
    const identifier = await helpers.getLocalImageId(module)
    const exists = (await helpers.dockerCli(module, `images ${identifier} -q`)).stdout.trim().length > 0
    return exists ? identifier : null
  },

  async dockerCli(module: ContainerModule, args) {
    // TODO: use dockerode instead of CLI
    return childProcess.exec("docker " + args, { cwd: await module.buildPath, maxBuffer: 1024 * 1024 })
  },

  async hasDockerfile(module: ContainerModule) {
    const buildPath = await module.buildPath
    return pathExists(join(buildPath, "Dockerfile"))
  },
}

export async function parseContainerModule({ moduleConfig }: ParseModuleParams<ContainerModule>) {
  moduleConfig.spec = validate(moduleConfig.spec, containerModuleSpecSchema, { context: `module ${moduleConfig.name}` })

  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map(spec => {
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

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  // make sure we can build the thing
  if (!moduleConfig.spec.image && !(await pathExists(join(moduleConfig.path, "Dockerfile")))) {
    throw new ConfigurationError(
      `Module ${moduleConfig.name} neither specifies image nor provides Dockerfile`,
      {},
    )
  }

  return moduleConfig
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

      async buildModule({ module, logEntry }: BuildModuleParams<ContainerModule>) {
        const buildPath = await module.buildPath
        const image = await getImage(module)

        if (!!image && !(await helpers.hasDockerfile(module))) {
          if (await helpers.imageExistsLocally(module)) {
            return { fresh: false }
          }
          logEntry && logEntry.setState(`Pulling image ${image}...`)
          await helpers.pullImage(module)
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
        if (!(await helpers.hasDockerfile(module))) {
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
