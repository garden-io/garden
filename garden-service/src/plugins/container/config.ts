/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import deline = require("deline")

import { Module, FileCopySpec } from "../../types/module"
import {
  joiEnvVars,
  joiUserIdentifier,
  joiArray,
  PrimitiveMap,
  joiPrimitive,
  absolutePathRegex,
} from "../../config/common"
import { Service, ingressHostnameSchema } from "../../types/service"
import { DEFAULT_PORT_PROTOCOL } from "../../constants"
import { ModuleSpec, ModuleConfig } from "../../config/module"
import { CommonServiceSpec, ServiceConfig, baseServiceSchema } from "../../config/service"
import { baseTaskSpecSchema, BaseTaskSpec } from "../../config/task"
import { baseTestSpecSchema, BaseTestSpec } from "../../config/test"

export interface ContainerIngressSpec {
  hostname?: string
  path: string
  port: string
}

export type ServicePortProtocol = "TCP" | "UDP"

export interface ServicePortSpec {
  name: string
  protocol: ServicePortProtocol
  containerPort: number
  // Defaults to containerPort
  servicePort: number
  hostPort?: number
  nodePort?: number | null
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

export interface ContainerServiceSpec extends CommonServiceSpec {
  args: string[],
  daemon: boolean
  ingresses: ContainerIngressSpec[],
  env: PrimitiveMap,
  healthCheck?: ServiceHealthCheckSpec,
  hotReloadArgs?: string[],
  ports: ServicePortSpec[],
  volumes: ServiceVolumeSpec[],
}

const hotReloadSyncSchema = Joi.object()
  .keys({
    source: Joi.string().uri(<any>{ relativeOnly: true })
      .default(".")
      .description(deline`
        POSIX-style path of the directory to sync to the target, relative to the module's top-level directory.
        Must be a relative path if provided. Defaults to the module's top-level directory if no value is provided.`)
      .example("src"),
    target: Joi.string().uri(<any>{ relativeOnly: true })
      .regex(absolutePathRegex)
      .required()
      .description(deline`
        POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is
        not allowed.`)
      .example("/app/src"),
  })

export interface ContainerHotReloadSpec {
  sync: FileCopySpec[]
}

const hotReloadConfigSchema = Joi.object()
  .keys({
    sync: Joi.array().items(hotReloadSyncSchema)
      .required()
      .description(
        "Specify one or more source files or directories to automatically sync into the running container.",
      ),
  })
  .description(deline`
    Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled
    services when those files or directories are modified. Applies to this module's services, and to services
    with this module as their \`sourceModule\`.
  `)

export type ContainerServiceConfig = ServiceConfig<ContainerServiceSpec>

const ingressSchema = Joi.object()
  .keys({
    hostname: ingressHostnameSchema,
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
      .description("Set this to check the service's health by making an HTTP request."),
    command: Joi.array().items(Joi.string())
      .description("Set this to check the service's health by running a command in its container."),
    tcpPort: Joi.string()
      .description("Set this to check the service's health by checking if this TCP port is accepting connections."),
  }).xor("httpGet", "command", "tcpPort")

export const portSchema = Joi.object()
  .keys({
    name: joiUserIdentifier()
      .required()
      .description("The name of the port (used when referencing the port elsewhere in the service configuration)."),
    protocol: Joi.string()
      .allow("TCP", "UDP")
      .default(DEFAULT_PORT_PROTOCOL)
      .description("The protocol of the port."),
    containerPort: Joi.number()
      .required()
      .example("8080")
      .description(deline`
        The port exposed on the container by the running procces. This will also be the default value
        for \`servicePort\`.

        \`servicePort:80 -> containerPort:8080 -> process:8080\``),
    servicePort: Joi.number().default((context) => context.containerPort, "<containerPort>")
      .example("80")
      .description(deline`The port exposed on the service.
        Defaults to \`containerPort\` if not specified.

        \`servicePort:80 -> containerPort:8080 -> process:8080\``),
    hostPort: Joi.number()
      .meta({ deprecated: true }),
    nodePort: Joi.number()
      .description(deline`
        Set this to expose the service on the specified port on the host node
        (may not be supported by all providers).`),
  })
  .required()

const volumeSchema = Joi.object()
  .keys({
    name: joiUserIdentifier()
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
    args: Joi.array().items(Joi.string())
      .description("The arguments to run the container with when starting the service."),
    daemon: Joi.boolean()
      .default(false)
      .description("Whether to run the service as a daemon (to ensure only one runs per node)."),
    ingresses: joiArray(ingressSchema)
      .description("List of ingress endpoints that the service exposes.")
      .example([
        [{ path: "/api", port: "http" }],
        {},
      ]),
    env: joiEnvVars(),
    healthCheck: healthCheckSchema
      .description("Specify how the service's health should be checked after deploying."),
    hotReloadArgs: Joi.array().items(Joi.string())
      .description(deline`
        If this module uses the \`hotReload\` field, the container will be run with
        these arguments instead of those in \`args\` when the service is deployed
        with hot reloading enabled.`,
      ),
    ports: joiArray(portSchema)
      .unique("name")
      .description("List of ports that the service container exposes."),
    volumes: joiArray(volumeSchema)
      .unique("name")
      .description("List of volumes that should be mounted when deploying the container."),
  })

export interface ContainerRegistryConfig {
  hostname: string,
  port?: number,
  namespace: string,
}

export const containerRegistryConfigSchema = Joi.object()
  .keys({
    hostname: Joi.string()
      .hostname()
      .required()
      .description("The hostname (and optionally port, if not the default port) of the registry.")
      .example("gcr.io"),
    port: Joi.number()
      .integer()
      .description("The port where the registry listens on, if not the default."),
    namespace: Joi.string()
      .default("_")
      .description("The namespace in the registry where images should be pushed.")
      .example("my-project"),
  })
  .required()
  .description(deline`
    The registry where built containers should be pushed to, and then pulled to the cluster when deploying
    services.
  `)

export interface ContainerService extends Service<ContainerModule> { }

export interface ContainerTestSpec extends BaseTestSpec {
  args: string[],
  env: { [key: string]: string },
}

export const containerTestSchema = baseTestSpecSchema
  .keys({
    args: Joi.array().items(Joi.string())
      .description("The arguments used to run the test inside the container.")
      .example([["npm", "test"], {}]),
    env: joiEnvVars(),
  })

export interface ContainerTaskSpec extends BaseTaskSpec {
  args: string[],
}

export const containerTaskSchema = baseTaskSpecSchema
  .keys({
    args: Joi.array().items(Joi.string())
      .description("The arguments used to run the task inside the container.")
      .example([["rake", "db:migrate"], {}]),
  })
  .description("A task that can be run in the container.")

export interface ContainerModuleSpec extends ModuleSpec {
  buildArgs: PrimitiveMap,
  image?: string,
  dockerfile?: string,
  hotReload?: ContainerHotReloadSpec,
  services: ContainerServiceSpec[],
  tests: ContainerTestSpec[],
  tasks: ContainerTaskSpec[],
}

export type ContainerModuleConfig = ModuleConfig<ContainerModuleSpec>

export const defaultNamespace = "_"
export const defaultTag = "latest"

export const containerModuleSpecSchema = Joi.object()
  .keys({
    buildArgs: Joi.object()
      .pattern(/.+/, joiPrimitive())
      .default(() => ({}), "{}")
      .description("Specify build arguments to use when building the container image."),
    // TODO: validate the image name format
    image: Joi.string()
      .description(deline`
        Specify the image name for the container. Should be a valid Docker image identifier. If specified and
        the module does not contain a Dockerfile, this image will be used to deploy services for this module.
        If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.`),
    hotReload: hotReloadConfigSchema,
    dockerfile: Joi.string().uri(<any>{ relativeOnly: true })
      .description("POSIX-style name of Dockerfile, relative to project root. Defaults to $MODULE_ROOT/Dockerfile."),
    services: joiArray(serviceSchema)
      .unique("name")
      .description("The list of services to deploy from this container module."),
    tests: joiArray(containerTestSchema)
      .description("A list of tests to run in the module."),
    // We use the user-facing term "tasks" as the key here, instead of "tasks".
    tasks: joiArray(containerTaskSchema)
      .description(deline`
        A list of tasks that can be run from this container module. These can be used as dependencies for services
        (executed before the service is deployed) or for other tasks.
      `),
  })
  .description("Configuration for a container module.")

export interface ContainerModule<
  M extends ContainerModuleSpec = ContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec
  > extends Module<M, S, T> { }
