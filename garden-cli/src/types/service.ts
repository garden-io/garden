/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import * as Joi from "joi"
import { ConfigurationError } from "../exceptions"
import { PluginContext } from "../plugin-context"
import {
  resolveTemplateStrings,
  TemplateOpts,
  TemplateStringContext,
} from "../template-string"
import { findByName } from "../util/util"
import {
  joiArray,
  joiIdentifier,
  joiIdentifierMap,
  joiPrimitive,
  PrimitiveMap,
} from "./common"
import { Module } from "./module"

export type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy" | "unknown" | "outdated" | "missing"

export type ServiceProtocol = "http" | "https" | "tcp" | "udp"

export interface ServiceEndpoint {
  protocol: ServiceProtocol
  hostname: string
  port?: number
  url: string
  paths?: string[]
}

export const serviceEndpointSchema = Joi.object()
  .keys({
    protocol: Joi.string()
      .only("http", "https", "tcp", "udp")
      .required()
      .description("The protocol to use for the endpoint."),
    hostname: Joi.string()
      .required()
      .description("The external hostname of the service endpoint."),
    port: Joi.number()
      .description("The port number that the service is exposed on."),
    url: Joi.string()
      .uri()
      .required()
      .description("The full URL of the service endpoint."),
    paths: Joi.array().items(Joi.string())
      .description("The paths that are available on the service endpoint (defaults to any path)."),
  })
  .description("A description of a deployed service endpoint.")

export interface ServiceSpec { }

export interface BaseServiceSpec extends ServiceSpec {
  name: string
  dependencies: string[]
  outputs: PrimitiveMap
}

export const serviceOutputsSchema = joiIdentifierMap(joiPrimitive())

export const baseServiceSchema = Joi.object()
  .keys({
    name: joiIdentifier().required(),
    dependencies: joiArray(joiIdentifier())
      .description("The names of services that this service depends on at runtime."),
    outputs: serviceOutputsSchema,
  })
  .unknown(true)
  .meta({ extendable: true })
  .description("The required attributes of a service. This is generally further defined by plugins.")

export interface ServiceConfig<T extends ServiceSpec = ServiceSpec> extends BaseServiceSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const serviceConfigSchema = baseServiceSchema
  .keys({
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The service's specification, as defined by its provider plugin."),
  })
  .description("The configuration for a module's service.")

// TODO: revise this schema
export interface ServiceStatus {
  providerId?: string
  providerVersion?: string
  version?: string
  state?: ServiceState
  runningReplicas?: number
  endpoints?: ServiceEndpoint[],
  lastMessage?: string
  lastError?: string
  createdAt?: string
  updatedAt?: string
  detail?: any
}

export const serviceStatusSchema = Joi.object()
  .keys({
    providerId: Joi.string()
      .description("The ID used for the service by the provider (if not the same as the service name)."),
    providerVersion: Joi.string()
      .description("The provider version of the deployed service (if different from the Garden module version."),
    version: Joi.string()
      .description("The Garden module version of the deployed service."),
    state: Joi.string()
      .only("ready", "deploying", "stopped", "unhealthy", "unknown", "outdated", "missing")
      .default("unknown")
      .description("The current deployment status of the service."),
    runningReplicas: Joi.number()
      .description("How many replicas of the service are currently running."),
    endpoints: Joi.array()
      .items(serviceEndpointSchema)
      .description("List of currently deployed endpoints for the service."),
    lastMessage: Joi.string()
      .allow("")
      .description("Latest status message of the service (if any)."),
    lastError: Joi.string()
      .description("Latest error status message of the service (if any)."),
    createdAt: Joi.string()
      .description("When the service was first deployed by the provider."),
    updatedAt: Joi.string()
      .description("When the service was last updated by the provider."),
    detail: Joi.object()
      .meta({ extendable: true })
      .description("Additional detail, specific to the provider."),
  })

export type RuntimeContext = {
  envVars: PrimitiveMap
  dependencies: {
    [name: string]: {
      version: string,
      outputs: PrimitiveMap,
    },
  },
  module: {
    name: string,
    type: string,
    version: string,
  },
}

export class Service<M extends Module = Module> {
  public spec: M["services"][0]["spec"]

  constructor(
    protected ctx: PluginContext, public module: M,
    public name: string, public config: M["services"][0],
  ) {
    this.spec = config.spec
  }

  static async factory<S extends Service<M>, M extends Module>(
    this: (new (ctx: PluginContext, module: M, name: string, config: S["config"]) => S),
    ctx: PluginContext, module: M, name: string,
  ) {
    const config = findByName(module.services, name)

    if (!config) {
      throw new ConfigurationError(`Could not find service ${name} in module ${module.name}`, { module, name })
    }

    // we allow missing keys here, because we don't have the required context for all keys at this point
    const context = await ctx.getTemplateContext()
    return (new this(ctx, module, name, config)).resolveConfig(context, { ignoreMissingKeys: true })
  }

  /*
    Returns all Services that this service depends on at runtime.
   */
  async getDependencies(): Promise<Service<any>[]> {
    return Bluebird.map(
      this.config.dependencies || [],
      async (depName: string) => await this.ctx.getService(depName),
    )
  }

  /*
    Returns the name of this service for use in environment variable names (e.g. my-service becomes MY_SERVICE).
   */
  getEnvVarName() {
    return this.name.replace("-", "_").toUpperCase()
  }

  /**
   * Resolves all template strings in the service and returns a new Service instance with the resolved config.
   */
  async resolveConfig(context?: TemplateStringContext, opts?: TemplateOpts) {
    if (!context) {
      const dependencies = await this.getDependencies()
      const runtimeContext = await this.module.prepareRuntimeContext(dependencies)
      context = await this.ctx.getTemplateContext(runtimeContext)
    }
    const resolved = await resolveTemplateStrings(this.config, context, opts)
    const cls = Object.getPrototypeOf(this).constructor
    return new cls(this.ctx, this.module, this.name, resolved)
  }

  async prepareRuntimeContext() {
    const dependencies = await this.getDependencies()
    return this.module.prepareRuntimeContext(dependencies)
  }
}
