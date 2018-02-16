import { Module } from "./module"
import { PrimitiveMap } from "./common"
import { GardenContext } from "../context"
import Bluebird = require("bluebird")
import { ConfigurationError } from "../exceptions"

export type ServiceState = "ready" | "deploying" | "stopped" | "unhealthy"

export type ServiceProtocol = "http" | "https" | "tcp" | "udp"

interface ServiceEndpoint {
  protocol: ServiceProtocol
  hostname: string
  port?: number
  url: string
  paths?: string[]
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

export interface ServiceContext {
  envVars?: PrimitiveMap
}

export class Service<T extends Module> {
  config: any

  constructor(public module: T, public name: string) {
    this.config = module.services[name]

    if (!this.config) {
      throw new ConfigurationError(`Could not find service ${name} in module ${module.name}`, { module, name })
    }
  }

  /*
    Returns all Services that this service depends on at runtime.
   */
  async getDependencies(ctx: GardenContext) {
    return Bluebird.map(
      this.config.dependencies,
      async (depName: string) => (await ctx.getServices([depName]))[depName],
    )
  }

  /*
    Returns the name of this service for use in environment variable names (e.g. my-service becomes MY_SERVICE).
   */
  getEnvVarName() {
    return this.name.replace("-", "_").toUpperCase()
  }
}
