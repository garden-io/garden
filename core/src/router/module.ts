/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs, uniqBy } from "lodash"
import { validateSchema } from "../config/validation"
import { defaultProvider } from "../config/provider"
import { ParameterError, PluginError, InternalError } from "../exceptions"
import { LogEntry } from "../logger/log-entry"
import { GardenModule } from "../types/module"
import {
  ModuleActionOutputs,
  ModuleActionParams,
  ModuleActionHandlers,
  GardenPlugin,
  WrappedModuleActionHandler,
  ModuleTypeDefinition,
  getModuleHandlerNames,
  getModuleHandlerDescriptions,
  ResolvedActionHandlerDescriptions,
  ModuleActionMap,
} from "../plugin/plugin"
import { Omit, getNames } from "../util/util"
import { getPluginBases, getPluginDependencies } from "../plugins"
import { ConfigureModuleParams, ConfigureModuleResult } from "../plugin/handlers/Module/configure"
import { PluginEventBroker } from "../plugin-context"
import { BuildDependencyConfig } from "../config/module"
import { Profile } from "../util/profiling"
import { ConfigGraph } from "../graph/config-graph"
import { GetModuleOutputsParams, GetModuleOutputsResult } from "../plugin/handlers/Module/get-outputs"
import { BaseRouter, BaseRouterParams } from "./base"
import { ConvertModuleParams, ConvertModuleResult } from "../plugin/handlers/Module/convert"

export interface DeployManyParams {
  graph: ConfigGraph
  log: LogEntry
  deployNames?: string[]
  force?: boolean
  forceBuild?: boolean
}

/**
 * The ActionRouter takes care of choosing which plugin should be responsible for handling an action,
 * and preparing common parameters (so as to reduce boilerplate on the usage side).
 *
 * Each plugin and module action has a corresponding method on this class (aside from configureProvider, which
 * is handled especially elsewhere).
 */
@Profile()
export class ModuleRouter extends BaseRouter {
  private readonly moduleHandlers: ModuleActionMap
  private readonly moduleHandlerDescriptions: ResolvedActionHandlerDescriptions

  constructor(params: BaseRouterParams, private readonly moduleTypes: { [name: string]: ModuleTypeDefinition }) {
    super(params)

    const moduleHandlerNames = getModuleHandlerNames()
    this.moduleHandlerDescriptions = getModuleHandlerDescriptions()
    this.moduleHandlers = <WrappedModuleActionMap>fromPairs(moduleHandlerNames.map((n) => [n, {}]))

    for (const plugin of params.configuredPlugins) {
      for (const spec of plugin.createModuleTypes) {
        for (const handlerType of moduleHandlerNames) {
          const handler = spec.handlers[handlerType]
          handler && this.addModuleHandler(plugin, handlerType, spec.name, handler)
        }
      }

      for (const spec of plugin.extendModuleTypes) {
        for (const handlerType of moduleHandlerNames) {
          const handler = spec.handlers[handlerType]
          handler && this.addModuleHandler(plugin, handlerType, spec.name, handler)
        }
      }
    }
  }

  //===========================================================================
  //region Module Actions
  //===========================================================================

  async configureModule<T extends GardenModule>(
    params: Omit<ConfigureModuleParams<T>, "ctx"> & { events?: PluginEventBroker }
  ): Promise<ConfigureModuleResult> {
    const { log, moduleConfig: config } = params
    const moduleType = config.type

    this.garden.log.silly(`Calling configure handler for ${moduleType} module '${config.name}'`)

    const handler = await this.getModuleHandler({
      handlerType: "configure",
      moduleType,
      defaultHandler: async ({ moduleConfig }) => ({ moduleConfig }),
    })

    const handlerParams = {
      ...(await this.commonParams(handler, log, undefined, params.events)),
      ...params,
    }

    const result = await handler(<any>handlerParams)

    // Consolidate the configured build dependencies, in case there are duplicates
    const buildDeps: { [key: string]: BuildDependencyConfig } = {}

    for (const dep of result.moduleConfig.build.dependencies) {
      if (buildDeps[dep.name]) {
        buildDeps[dep.name].copy = uniqBy([...buildDeps[dep.name].copy, ...dep.copy], (c) => `${c.source}:${c.target}`)
      } else {
        buildDeps[dep.name] = dep
      }
    }
    result.moduleConfig.build.dependencies = Object.values(buildDeps)

    this.garden.log.silly(`Called configure handler for ${moduleType} module '${config.name}'`)

    return result
  }

  async convert<T extends GardenModule>(
    params: Omit<ConvertModuleParams<T>, "ctx"> & { events?: PluginEventBroker }
  ): Promise<ConvertModuleResult> {
    const { log, module } = params
    const moduleType = module.type

    const handler = await this.getModuleHandler({
      handlerType: "convert",
      moduleType,
    })

    const handlerParams = {
      ...(await this.commonParams(handler, log, undefined, params.events)),
      ...params,
    }

    const result = await handler(<any>handlerParams)

    // TODO-G2: Ensure some fields get copied over correctly
    // (path, configPath, templateName, plugin, disabled, allowPublish, variables+varfiles on Group)
    // Validate action names
    // Dedupe dependencies on actions

    return result
  }

  async getModuleOutputs<T extends GardenModule>(
    params: Omit<GetModuleOutputsParams<T>, "ctx"> & { events?: PluginEventBroker }
  ): Promise<GetModuleOutputsResult> {
    const { log, moduleConfig: config } = params
    const moduleType = config.type

    const handler = await this.getModuleHandler({
      handlerType: "getModuleOutputs",
      moduleType,
      defaultHandler: async () => ({ outputs: {} }),
    })

    const handlerParams = {
      ...(await this.commonParams(handler, log, undefined, params.events)),
      ...params,
    }

    return handler(<any>handlerParams)
  }

  private addModuleHandler<T extends keyof ModuleActionHandlers>(
    plugin: GardenPlugin,
    handlerType: T,
    moduleType: string,
    handler: ModuleActionHandlers[T]
  ) {
    const pluginName = plugin.name
    const schema = this.moduleHandlerDescriptions[handlerType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped = Object.assign(
      <WrappedModuleActionHandlers[T]>(async (...args: any[]) => {
        const result = await handler.apply(plugin, args)
        if (result === undefined) {
          throw new PluginError(
            `Got empty response from ${moduleType}.${handlerType} handler on ${pluginName} provider`,
            {
              args,
              handlerType,
              pluginName,
            }
          )
        }
        return validateSchema(result, schema, {
          context: `${handlerType} handler output from provider ${pluginName} for module type ${moduleType} `,
        })
      }),
      { handlerType, pluginName, moduleType, wrapped: handler }
    )

    // TODO-G2B: fix the any cast
    wrapped.base = <any>this.wrapBase(handler.base)

    if (!this.moduleHandlers[handlerType]) {
      this.moduleHandlers[handlerType] = {}
    }

    if (!this.moduleHandlers[handlerType][moduleType]) {
      // I'm not sure why we need the cast here - JE
      const handlers: any = this.moduleHandlers
      handlers[handlerType][moduleType] = {}
    }

    this.moduleHandlers[handlerType][moduleType][pluginName] = wrapped
  }

  /**
   * Get a handler for the specified module action.
   */
  private async getModuleHandlers<T extends keyof ModuleActionHandlers>({
    handlerType,
    moduleType,
    pluginName,
  }: {
    handlerType: T
    moduleType: string
    pluginName?: string
  }): Promise<WrappedModuleActionHandlerMap<T>> {
    return this.filterHandlers((this.moduleHandlers[handlerType] || {})[moduleType], pluginName)
  }

  /**
   * Get the configured handler for the specified action.
   */
  async getModuleHandler<T extends keyof ModuleActionHandlers>({
    handlerType,
    moduleType,
    pluginName,
    defaultHandler,
  }: {
    handlerType: T
    moduleType: string
    pluginName?: string
    defaultHandler?: ModuleActionHandlers[T]
  }): Promise<WrappedModuleActionHandlers[T]> {
    const handlers = Object.values(await this.getModuleHandlers({ handlerType, moduleType, pluginName }))
    const spec = this.moduleTypes[moduleType]

    if (handlers.length === 0 && spec.base && !pluginName) {
      // No handler found but module type has a base. Check if the base type has the handler we're looking for.
      this.garden.log.silly(`No ${handlerType} handler found for ${moduleType}. Trying ${spec.base} base.`)

      return this.getModuleHandler({
        handlerType,
        moduleType: spec.base,
        defaultHandler,
      })
    } else if (handlers.length === 1) {
      // Nice and simple, just return the only applicable handler
      return handlers[0]
    } else if (handlers.length > 0) {
      // Multiple matches. We start by filtering down to "leaf nodes", i.e. handlers which are not being overridden
      // by other matched handlers.
      const filtered = handlers.filter((handler) => {
        for (const other of handlers) {
          if (other === handler) {
            continue
          }

          const plugin = this.loadedPlugins[other.pluginName]
          const bases = getPluginBases(plugin, this.loadedPlugins)
          const deps = getPluginDependencies(plugin, this.loadedPlugins)
          const allDepNames = [...getNames(bases), ...getNames(deps)]

          if (allDepNames.includes(handler.pluginName)) {
            // This handler is in `other`'s dependency chain, so `other` is overriding it
            return false
          }
        }
        return true
      })

      if (filtered.length > 1) {
        // If we still end up with multiple handlers with no obvious best candidate, we use the order of configuration
        // as a tie-breaker.
        const configs = this.garden.getRawProviderConfigs()

        for (const config of configs.reverse()) {
          for (const handler of filtered) {
            if (handler.pluginName === config.name) {
              return handler
            }
          }
        }

        // This should never happen
        throw new InternalError(
          `Unable to find any matching configuration when selecting ${moduleType}/${handlerType} handler ` +
            `(please report this as a bug).`,
          { handlers, configs }
        )
      } else {
        return filtered[0]
      }
    } else if (defaultHandler) {
      // Return the default handler, but wrap it to match the expected interface.
      return Object.assign(<WrappedModuleActionHandlers[T]>defaultHandler, {
        handlerType,
        moduleType,
        pluginName: defaultProvider.name,
      })
    } else {
      // Nothing matched, throw error.
      const errorDetails = {
        requestedHandlerType: handlerType,
        requestedModuleType: moduleType,
        environment: this.garden.environmentName,
        pluginName,
      }

      if (pluginName) {
        throw new PluginError(
          `Plugin '${pluginName}' does not have a '${handlerType}' handler for module type '${moduleType}'.`,
          errorDetails
        )
      } else {
        throw new ParameterError(
          `No '${handlerType}' handler configured for module type '${moduleType}' in environment ` +
            `'${this.garden.environmentName}'. Are you missing a provider configuration?`,
          errorDetails
        )
      }
    }
  }
}

type WrappedModuleActionHandlers<T extends GardenModule = GardenModule> = {
  [P in keyof ModuleActionParams<T>]: WrappedModuleActionHandler<ModuleActionParams<T>[P], ModuleActionOutputs[P]>
}

interface WrappedModuleActionHandlerMap<T extends keyof ModuleActionHandlers> {
  [actionName: string]: WrappedModuleActionHandlers[T]
}

type WrappedModuleActionMap = {
  [A in keyof ModuleActionHandlers]: {
    [moduleType: string]: {
      [pluginName: string]: WrappedModuleActionHandlers[A]
    }
  }
}
