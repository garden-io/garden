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
import { findByName } from "../util"
import {
  joiArray,
  joiIdentifier,
  joiIdentifierMap,
  joiPrimitive,
  PrimitiveMap,
} from "./common"
import { Module } from "./module"

export type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy"

export type ServiceProtocol = "http" | "https" | "tcp" | "udp"

export interface ServiceEndpoint {
  protocol: ServiceProtocol
  hostname: string
  port?: number
  url: string
  paths?: string[]
}

export const serviceEndpointSchema = Joi.object().keys({
  protocol: Joi.string().only("http", "https", "tcp", "udp").required(),
  hostname: Joi.string().required(),
  port: Joi.number(),
  url: Joi.string().required(),
  paths: Joi.array().items(Joi.string()),
})

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
    dependencies: joiArray(joiIdentifier()),
    outputs: serviceOutputsSchema,
  })
  .unknown(true)

export interface ServiceConfig<T extends ServiceSpec = ServiceSpec> extends BaseServiceSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const serviceConfigSchema = baseServiceSchema.keys({
  spec: Joi.object(),
})

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

export const serviceStatusSchema = Joi.object().keys({
  providerId: Joi.string(),
  providerVersion: Joi.string(),
  version: Joi.string(),
  state: Joi.string(),
  runningReplicas: Joi.number(),
  endpoints: Joi.array().items(serviceEndpointSchema),
  lastMessage: Joi.string().allow(""),
  lastError: Joi.string(),
  createdAt: Joi.string(),
  updatedAt: Joi.string(),
  detail: Joi.object(),
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

  async prepareRuntimeContext(extraEnvVars: PrimitiveMap = {}) {
    const dependencies = await this.getDependencies()
    return this.module.prepareRuntimeContext(dependencies, { ...extraEnvVars })
  }
}
