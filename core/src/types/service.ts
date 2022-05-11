/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import normalizeUrl from "normalize-url"
import { format } from "url"
import {
  joiUserIdentifier,
  joi,
  joiIdentifier,
  joiArray,
  PrimitiveMap,
  joiVariables,
  versionStringSchema,
} from "../config/common"
import { GardenModule } from "./module"
import { ServiceConfig, serviceConfigSchema } from "../config/service"
import dedent = require("dedent")
import { uniq } from "lodash"
import { ConfigGraph } from "../config-graph"
import { getEntityVersion } from "../vcs/vcs"
import { NamespaceStatus, namespaceStatusesSchema } from "./plugin/base"

export interface GardenService<M extends GardenModule = GardenModule, S extends GardenModule = GardenModule> {
  name: string
  module: M
  config: M["serviceConfigs"][0]
  disabled: boolean
  sourceModule: S
  spec: M["serviceConfigs"][0]["spec"]
  version: string
}

export const serviceSchema = () =>
  joi
    .object()
    .options({ presence: "required" })
    .keys({
      name: joiUserIdentifier().description("The name of the service."),
      module: joi.object().unknown(true), // This causes a stack overflow: joi.lazy(() => moduleSchema()),
      sourceModule: joi.object().unknown(true), // This causes a stack overflow: joi.lazy(() => moduleSchema()),
      disabled: joi.boolean().default(false).description("Set to true if the service or its module is disabled."),
      config: serviceConfigSchema(),
      spec: joi.object().description("The raw configuration of the service (specific to each plugin)."),
      version: versionStringSchema().description("The version of the service."),
    })

export function serviceFromConfig<M extends GardenModule = GardenModule>(
  graph: ConfigGraph,
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

export type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy" | "unknown" | "outdated" | "missing"
export const serviceStates: ServiceState[] = [
  "ready",
  "deploying",
  "stopped",
  "unhealthy",
  "unknown",
  "outdated",
  "missing",
]

/**
 * Given a list of states, return a single state representing the list.
 */
export function combineStates(states: ServiceState[]): ServiceState {
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

export interface ServiceIngressSpec {
  hostname?: string
  linkUrl?: string
  path: string
  port: number
  protocol: ServiceProtocol
}

export interface ServiceIngress {
  hostname: string
  linkUrl?: string
  path: string
  port?: number
  protocol: ServiceProtocol
}

export const ingressHostnameSchema = () =>
  joi.hostname().description(dedent`
    The hostname that should route to this service. Defaults to the default hostname configured in the provider configuration.

    Note that if you're developing locally you may need to add this hostname to your hosts file.
  `)

export const linkUrlSchema = () =>
  joi.string().uri().description(dedent`
    The link URL for the ingress to show in the console and on the dashboard. Also used when calling the service with the \`call\` command.

    Use this if the actual URL is different from what's specified in the ingress, e.g. because there's a load balancer in front of the service that rewrites the paths.

    Otherwise Garden will construct the link URL from the ingress spec.
  `)

const portSchema = () =>
  joi.number().description(dedent`
    The port number that the service is exposed on internally.
    This defaults to the first specified port for the service.
  `)

export const serviceIngressSpecSchema = () =>
  joi.object().keys({
    hostname: ingressHostnameSchema(),
    port: portSchema(),
    path: joi.string().default("/").description("The ingress path that should be matched to route to this service."),
    protocol: joi.string().valid("http", "https").required().description("The protocol to use for the ingress."),
  })

export const serviceIngressSchema = () =>
  serviceIngressSpecSchema()
    .keys({
      hostname: joi.string().required().description("The hostname where the service can be accessed."),
    })
    .unknown(true)
    .description("A description of a deployed service ingress.")

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

const forwardablePortSchema = () => joi.object().keys(forwardablePortKeys())

export interface ServiceStatus<T = any> {
  createdAt?: string
  detail: T
  devMode?: boolean
  localMode?: boolean
  namespaceStatuses?: NamespaceStatus[]
  externalId?: string
  externalVersion?: string
  forwardablePorts?: ForwardablePort[]
  ingresses?: ServiceIngress[]
  lastMessage?: string
  lastError?: string
  outputs?: PrimitiveMap
  runningReplicas?: number
  state: ServiceState
  updatedAt?: string
  version?: string
}

export interface ServiceStatusMap {
  [key: string]: ServiceStatus
}

export const serviceStatusSchema = () =>
  joi.object().keys({
    createdAt: joi.string().description("When the service was first deployed by the provider."),
    detail: joi.object().meta({ extendable: true }).description("Additional detail, specific to the provider."),
    devMode: joi.boolean().description("Whether the service was deployed with dev mode enabled."),
    localMode: joi.boolean().description("Whether the service was deployed with local mode enabled."),
    namespaceStatuses: namespaceStatusesSchema().optional(),
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
    outputs: joiVariables().description("A map of values output from the service."),
    runningReplicas: joi.number().description("How many replicas of the service are currently running."),
    state: joi
      .string()
      .valid("ready", "deploying", "stopped", "unhealthy", "unknown", "outdated", "missing")
      .default("unknown")
      .description("The current deployment status of the service."),
    updatedAt: joi.string().description("When the service was last updated by the provider."),
    version: joi.string().description("The Garden module version of the deployed service."),
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
