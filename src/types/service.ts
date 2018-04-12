/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import * as Joi from "joi"
import { Module } from "./module"
import { joiPrimitive, PrimitiveMap, validate } from "./common"
import { Garden } from "../garden"
import { ConfigurationError } from "../exceptions"
import { resolveTemplateStrings, TemplateOpts, TemplateStringContext } from "../template-string"

export type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy"

export type ServiceProtocol = "http" | "https" | "tcp" | "udp"

export interface ServiceEndpoint {
  protocol: ServiceProtocol
  hostname: string
  port?: number
  url: string
  paths?: string[]
}

export interface ServiceConfig {
  dependencies: string[]
}

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

export type ServiceContext = {
  envVars: PrimitiveMap
  dependencies: {
    [name: string]: {
      version: string,
      outputs: PrimitiveMap,
    },
  },
}

const serviceOutputsSchema = Joi.object().pattern(/.+/, joiPrimitive())

export class Service<M extends Module> {
  constructor(
    protected ctx: Garden, public module: M,
    public name: string, public config: M["services"][string],
  ) { }

  static async factory<S extends Service<M>, M extends Module>(
    this: (new (ctx: Garden, module: M, name: string, config: S["config"]) => S),
    ctx: Garden, module: M, name: string,
  ) {
    const config = module.services[name]

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
  async getDependencies() {
    return Bluebird.map(
      this.config.dependencies,
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
  async resolveConfig(context?: TemplateStringContext, opts?: TemplateOpts): Promise<Service<M>> {
    if (!context) {
      context = await this.ctx.getTemplateContext(await this.prepareContext())
    }
    const resolved = await resolveTemplateStrings(this.config, context, opts)
    const cls = Object.getPrototypeOf(this).constructor
    return new cls(this.ctx, this.module, this.name, resolved)
  }

  async prepareContext(): Promise<ServiceContext> {
    const envVars = {
      GARDEN_VERSION: await this.module.getVersion(),
    }
    const dependencies = {}

    for (const key in this.ctx.projectConfig.variables) {
      envVars[key] = this.ctx.projectConfig.variables[key]
    }

    for (const dep of await this.getDependencies()) {
      const depContext = dependencies[dep.name] = {
        version: await dep.module.getVersion(),
        outputs: {},
      }

      const outputs = await this.ctx.getServiceOutputs(dep)
      const serviceEnvName = dep.getEnvVarName()

      validate(outputs, serviceOutputsSchema, `outputs for service ${dep.name}`)

      for (const [key, value] of Object.entries(outputs)) {
        const envVarName = `GARDEN_SERVICES_${serviceEnvName}_${key}`.toUpperCase()

        envVars[envVarName] = value
        depContext.outputs[key] = value
      }
    }

    return { envVars, dependencies }
  }
}
