/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import normalizeUrl from "normalize-url"
import { format } from "url"
import type { PrimitiveMap } from "../config/common.js"
import {
  joiUserIdentifier,
  joi,
  joiIdentifier,
  joiArray,
  joiVariables,
  versionStringSchema,
  joiStringMap,
  createSchema,
} from "../config/common.js"
import type { GardenModule } from "./module.js"
import type { ServiceConfig } from "../config/service.js"
import { serviceConfigSchema } from "../config/service.js"
import dedent from "dedent"
import { memoize, uniq } from "lodash-es"
import { getEntityVersion } from "../vcs/vcs.js"
import type { LogLevel } from "../logger/logger.js"
import type { ActionMode } from "../actions/types.js"
import type { ModuleGraph } from "../graph/modules.js"

export interface GardenService<M extends GardenModule = GardenModule, S extends GardenModule = GardenModule> {
  name: string
  module: M
  config: M["serviceConfigs"][0]
  disabled: boolean
  sourceModule: S
  spec: M["serviceConfigs"][0]["spec"]
  version: string
}

export const serviceSchema = createSchema({
  name: "module-service",
  keys: () => ({
    name: joiUserIdentifier().description("The name of the service."),
    module: joi.object().unknown(true), // This causes a stack overflow: joi.lazy(() => moduleSchema()),
    sourceModule: joi.object().unknown(true), // This causes a stack overflow: joi.lazy(() => moduleSchema()),
    disabled: joi.boolean().default(false).description("Set to true if the service or its module is disabled."),
    config: serviceConfigSchema(),
    spec: joi.object().description("The raw configuration of the service (specific to each plugin)."),
    version: versionStringSchema().description("The version of the service."),
  }),
  options: { presence: "required" },
})

export function serviceFromConfig<M extends GardenModule = GardenModule>(
  graph: ModuleGraph,
  module: M,
  config: ServiceConfig
): GardenService<M> {
  const sourceModule = config.sourceModuleName ? graph.getModule(config.sourceModuleName, true) : module
  const version = getEntityVersion(module, config)

  return {
    name: config.name,
    module,
    config,
    disabled: module.disabled || config.disabled,
    sourceModule,
    spec: config.spec,
    version,
  }
}

export const deployStates = ["ready", "deploying", "stopped", "unhealthy", "unknown", "outdated", "missing"] as const
export type DeployState = (typeof deployStates)[number]

export type DeployStatusForEventPayload = Pick<
  ServiceStatus,
  | "createdAt"
  | "mode"
  | "externalId"
  | "externalVersion"
  | "forwardablePorts"
  | "ingresses"
  | "lastMessage"
  | "lastError"
  | "outputs"
  | "runningReplicas"
  | "state"
  | "updatedAt"
>

/**
 * Given a list of states, return a single state representing the list.
 */
export function combineStates(states: DeployState[]): DeployState {
  const unique = uniq(states)

  if (unique.length === 1) {
    return unique[0]
  }

  if (unique.includes("unhealthy")) {
    return "unhealthy"
  }

  if (unique.includes("deploying")) {
    return "deploying"
  }

  return "outdated"
}

// TODO: support TCP, UDP and gRPC
export type ServiceProtocol = "http" | "https" // | "tcp" | "udp"

export interface ServiceIngress {
  hostname: string
  linkUrl?: string
  path: string
  port?: number
  protocol: ServiceProtocol
}

export const ingressHostnameSchema = memoize(() =>
  joi.hostname().description(dedent`
    The hostname that should route to this service. Defaults to the default hostname configured in the provider configuration.

    Note that if you're developing locally you may need to add this hostname to your hosts file.
  `)
)

export const linkUrlSchema = memoize(() =>
  joi.string().uri().description(dedent`
    The link URL for the ingress to show in the console and in dashboards. Also used when calling the service with the \`call\` command.

    Use this if the actual URL is different from what's specified in the ingress, e.g. because there's a load balancer in front of the service that rewrites the paths.

    Otherwise Garden will construct the link URL from the ingress spec.
  `)
)

const portSchema = memoize(() =>
  joi.number().description(dedent`
    The port number that the service is exposed on internally.
    This defaults to the first specified port for the service.
  `)
)

export const serviceIngressSpecSchema = createSchema({
  name: "service-ingress-spec",
  keys: () => ({
    hostname: ingressHostnameSchema(),
    port: portSchema(),
    path: joi.string().default("/").description("The ingress path that should be matched to route to this service."),
    protocol: joi.string().valid("http", "https").required().description("The protocol to use for the ingress."),
  }),
})

export const serviceIngressSchema = createSchema({
  name: "service-ingress",
  extend: serviceIngressSpecSchema,
  description: "A description of a deployed service ingress.",
  keys: () => ({
    hostname: joi.string().required().description("The hostname where the service can be accessed."),
  }),
  allowUnknown: true,
})

export interface ForwardablePort {
  name?: string
  // TODO: support other protocols
  preferredLocalPort?: number
  protocol: "TCP"
  targetName?: string
  targetPort: number
  urlProtocol?: string
}

export const forwardablePortKeys = () => ({
  name: joiIdentifier().description(
    "A descriptive name for the port. Should correspond to user-configured ports where applicable."
  ),
  preferredLocalPort: joi.number().integer().description("The preferred local port to use for forwarding."),
  protocol: joi.string().allow("TCP").default("TCP").description("The protocol of the port."),
  targetName: joi.string().description("The target name/hostname to forward to (defaults to the service name)."),
  targetPort: joi.number().integer().required().description("The target port on the service."),
  urlProtocol: joi
    .string()
    .description("The protocol to use for URLs pointing at the port. This can be any valid URI protocol."),
})

export const forwardablePortSchema = createSchema({
  name: "forwardable-port",
  keys: forwardablePortKeys,
})

export type ServiceStatus<D = any, O = PrimitiveMap> = {
  createdAt?: string
  detail: D
  mode?: ActionMode
  externalId?: string
  externalVersion?: string
  forwardablePorts?: ForwardablePort[]
  ingresses?: ServiceIngress[]
  lastMessage?: string
  lastError?: string
  outputs?: O
  runningReplicas?: number
  state: DeployState
  updatedAt?: string
}

export const serviceStatusSchema = createSchema({
  name: "service-status",
  keys: () => ({
    createdAt: joi.string().description("When the service was first deployed by the provider."),
    detail: joi.object().meta({ extendable: true }).description("Additional detail, specific to the provider."),
    mode: joi.string().default("default").description("The mode the action is deployed in."),
    externalId: joi
      .string()
      .description("The ID used for the service by the provider (if not the same as the service name)."),
    externalVersion: joi
      .string()
      .description("The provider version of the deployed service (if different from the Garden module version."),
    forwardablePorts: joiArray(forwardablePortSchema()).description(
      "A list of ports that can be forwarded to from the Garden agent by the provider."
    ),
    ingresses: joi
      .array()
      .items(serviceIngressSchema())
      .description("List of currently deployed ingress endpoints for the service."),
    lastMessage: joi.string().allow("").description("Latest status message of the service (if any)."),
    lastError: joi.string().description("Latest error status message of the service (if any)."),
    outputs: joiVariables().description("A map of values output from the deployment."),
    runningReplicas: joi.number().description("How many replicas of the service are currently running."),
    state: joi
      .string()
      .valid(...deployStates)
      .default("unknown")
      .description("The current deployment status of the service."),
    updatedAt: joi.string().description("When the service was last updated by the provider."),
    version: joi.string().description("The Garden module version of the deployed service."),
  }),
  // TODO(deprecation): deprecate in 0.14 - the old devMode syntax must be deprecated
  rename: [["devMode", "syncMode"]],
})

/**
 * Returns the link URL or falls back to constructing the URL from the ingress spec
 */
export function getLinkUrl(ingress: ServiceIngress) {
  if (ingress.linkUrl) {
    return ingress.linkUrl
  }

  return getIngressUrl(ingress)
}

/**
 * Returns a normalized URL string, constructed from the ingress spec
 */
export function getIngressUrl(ingress: ServiceIngress) {
  return normalizeUrl(
    format({
      protocol: ingress.protocol,
      hostname: ingress.hostname,
      port: ingress.port,
      pathname: ingress.path,
    })
  )
}

export interface DeployLogEntry {
  name: string
  timestamp?: Date
  msg: string
  level?: LogLevel
  tags?: { [key: string]: string }
}

export const deployLogEntrySchema = createSchema({
  name: "deploy-log-entry",
  description: "A log entry returned by a getServiceLogs action handler.",
  keys: () => ({
    name: joi.string().required().description("The name of the Deploy/service the log entry originated from."),
    timestamp: joi.date().required().description("The time when the log entry was generated by the service."),
    msg: joi.string().required().description("The content of the log entry."),
    level: joi
      .number()
      .integer()
      .min(0)
      .max(5)
      .description(
        dedent`
        The log level of the entry. Level 2 (info) should be reserved for logs from the service proper.
        Other levels can be used to print warnings or debug information from the plugin.

        Level should be an integer from 0-5 (error, warn, info, verbose, debug, silly).
      `
      ),
    tags: joiStringMap(joi.string()).description("Tags used for later filtering in the logs command."),
  }),
})
