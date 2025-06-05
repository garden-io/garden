/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs, mapValues, omit } from "lodash-es"
import pProps from "p-props"

import { validateSchema } from "../config/validation.js"
import { defaultProvider } from "../config/provider.js"
import { ParameterError, PluginError } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import type { PluginActionParamsBase } from "../plugin/base.js"
import type {
  ProviderActionOutputs,
  ProviderActionParams,
  GardenPluginSpec,
  WrappedActionHandler,
  ResolvedActionHandlerDescriptions,
  ProviderHandlers,
} from "../plugin/plugin.js"
import { getProviderActionDescriptions, getProviderHandlerNames } from "../plugin/plugin.js"
import type {
  CleanupEnvironmentParams,
  CleanupEnvironmentResult,
} from "../plugin/handlers/Provider/cleanupEnvironment.js"
import type {
  EnvironmentStatusMap,
  GetEnvironmentStatusParams,
  EnvironmentStatus,
} from "../plugin/handlers/Provider/getEnvironmentStatus.js"
import type { Omit } from "../util/util.js"
import type { DebugInfoMap } from "../plugin/handlers/Provider/getDebugInfo.js"
import type {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
} from "../plugin/handlers/Provider/prepareEnvironment.js"
import type { ConfigureProviderParams, ConfigureProviderResult } from "../plugin/handlers/Provider/configureProvider.js"
import type { PluginContext, PluginEventBroker } from "../plugin-context.js"
import type { AugmentGraphResult, AugmentGraphParams } from "../plugin/handlers/Provider/augmentGraph.js"
import { Profile } from "../util/profiling.js"
import type { GetDashboardPageParams, GetDashboardPageResult } from "../plugin/handlers/Provider/getDashboardPage.js"
import type { CommonParams, BaseRouterParams } from "./base.js"
import { BaseRouter } from "./base.js"

/**
 * The ProviderRouter takes care of choosing which plugin should be responsible for handling a provider action,
 * and preparing common parameters (so as to reduce boilerplate on the usage side).
 *
 * Each provider handler has a corresponding method on this class.
 */
@Profile()
export class ProviderRouter extends BaseRouter {
  private readonly pluginHandlers: WrappedPluginActionMap
  private readonly pluginHandlerDescriptions: ResolvedActionHandlerDescriptions

  constructor(params: BaseRouterParams) {
    super(params)

    const pluginHandlerNames = getProviderHandlerNames()
    this.pluginHandlerDescriptions = getProviderActionDescriptions()
    this.pluginHandlers = <WrappedPluginActionMap>fromPairs(pluginHandlerNames.map((n) => [n, {}]))

    for (const plugin of params.configuredPlugins) {
      const handlers = plugin.handlers || {}

      for (const handlerType of pluginHandlerNames) {
        const handler = handlers[handlerType]
        handler && this.addPluginHandler(plugin, handlerType, handler)
      }
    }
  }

  //===========================================================================
  //region Environment Actions
  //===========================================================================

  async configureProvider(params: ConfigureProviderParams & { pluginName: string }): Promise<ConfigureProviderResult> {
    const pluginName = params.pluginName

    this.garden.log.silly(() => `Calling 'configureProvider' handler on '${pluginName}'`)

    const handler = await this.getPluginHandler({
      handlerType: "configureProvider",
      pluginName,
      defaultHandler: async ({ config }) => ({ config }),
    })

    const handlerParams: ProviderActionParams["configureProvider"] = {
      ...omit(params, ["pluginName"]),
      base: this.wrapBase(handler!.base),
    }

    const result = await (<Function>handler)(handlerParams)

    this.garden.log.silly(() => `Called 'configureProvider' handler on '${pluginName}'`)

    return result
  }

  async augmentGraph(params: RequirePluginName<ActionRouterParams<AugmentGraphParams>>): Promise<AugmentGraphResult> {
    const { pluginName } = params

    return this.callPluginActionHandler({
      handlerType: "augmentGraph",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ addDependencies: [], addActions: [] }),
    })
  }

  async getEnvironmentStatus(
    params: RequirePluginName<ActionRouterParams<GetEnvironmentStatusParams>> & { ctx?: PluginContext }
  ): Promise<EnvironmentStatus> {
    const { pluginName } = params

    return this.callPluginActionHandler({
      handlerType: "getEnvironmentStatus",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ ready: true, outputs: {} }),
    })
  }

  async prepareEnvironment(
    params: RequirePluginName<ActionRouterParams<PrepareEnvironmentParams>>
  ): Promise<PrepareEnvironmentResult> {
    const { pluginName } = params

    const res = await this.callPluginActionHandler({
      handlerType: "prepareEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({ status: { ready: true, outputs: {} } }),
    })

    return res
  }

  async cleanupEnvironment(
    params: RequirePluginName<ActionRouterParams<CleanupEnvironmentParams>>
  ): Promise<CleanupEnvironmentResult> {
    const { pluginName } = params
    const res = await this.callPluginActionHandler({
      handlerType: "cleanupEnvironment",
      pluginName,
      params: omit(params, ["pluginName"]),
      defaultHandler: async () => ({}),
    })

    return res
  }

  async getDashboardPage(
    params: RequirePluginName<ActionRouterParams<GetDashboardPageParams>>
  ): Promise<GetDashboardPageResult> {
    const { pluginName } = params
    return this.callPluginActionHandler({
      handlerType: "getDashboardPage",
      pluginName,
      params: omit(params, ["pluginName"]),
    })
  }

  //endregion

  //===========================================================================
  //region Helper Methods
  //===========================================================================

  /**
   * Runs cleanupEnvironment for all configured providers
   */
  async cleanupAll(log: Log) {
    log.info("Cleaning up environments...")
    const environmentStatuses: EnvironmentStatusMap = {}

    const providers = await this.garden.resolveProviders({ log })
    for (const provider of Object.values(providers)) {
      await this.cleanupEnvironment({ pluginName: provider.name, log, events: undefined })
      environmentStatuses[provider.name] = { ready: false, outputs: {} }
    }

    log.success("Done")

    return environmentStatuses
  }

  async getDebugInfo({ log, includeProject }: { log: Log; includeProject: boolean }): Promise<DebugInfoMap> {
    const handlers = await this.getPluginHandlers("getDebugInfo")

    const debugInfoMap = pProps(
      mapValues(handlers, async (h) =>
        h({ ...(await this.commonParams(h, log, undefined, undefined)), includeProject })
      )
    )

    return debugInfoMap
  }

  //endregion

  // We special-case the configureProvider handlers and don't call them through this
  private async callPluginActionHandler<T extends keyof Omit<WrappedPluginHandlers, "configureProvider">>({
    params,
    handlerType,
    pluginName,
    defaultHandler,
  }: {
    params: ActionRouterParams<ProviderActionParams[T]>
    handlerType: T
    pluginName: string
    defaultHandler?: ProviderHandlers[T]
  }): Promise<ProviderActionOutputs[T]> {
    this.garden.log.silly(() => `Calling ${handlerType} handler on plugin '${pluginName}'`)

    const handler = await this.getPluginHandler({
      handlerType,
      pluginName,
      defaultHandler,
    })

    const handlerParams: ProviderActionParams[T] = {
      ...(await this.commonParams(handler!, params.log, undefined, params.events)),
      ...(<any>params),
    }

    const result = await (<Function>handler)(handlerParams)

    this.garden.log.silly(() => `Called ${handlerType} handler on plugin '${pluginName}'`)

    return result
  }

  private addPluginHandler<T extends keyof WrappedPluginHandlers>(
    plugin: GardenPluginSpec,
    handlerType: T,
    handler: ProviderHandlers[T]
  ) {
    const pluginName = plugin.name
    const schema = this.pluginHandlerDescriptions[handlerType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped: WrappedPluginHandlers[T] = Object.assign(
      // TODO:
      // lots of casting and `any` here since we're using the same wrapper for all handlers.
      // We should probably have a separate wrapper for each handler type or make it more explicit in another way.
      async (...args: any[]) => {
        const result = await handler.apply(plugin, args as any)
        if (result === undefined) {
          throw new PluginError({
            message: `Got empty response from ${handlerType} handler on ${pluginName} provider. Called with ${args.length} args.`,
          })
        }
        return validateSchema(result, schema, { context: `${handlerType} output from plugin ${pluginName}` })
      },
      { handlerType, pluginName }
    ) as WrappedPluginHandlers[T]

    wrapped.base = this.wrapBase(handler.base)

    // I'm not sure why we need the cast here - JE
    const typeHandlers: any = this.pluginHandlers[handlerType]
    typeHandlers[pluginName] = wrapped
  }

  /**
   * Get a handler for the specified action.
   */
  private async getPluginHandlers<T extends keyof WrappedPluginHandlers>(
    handlerType: T,
    pluginName?: string
  ): Promise<WrappedActionHandlerMap<T>> {
    return this.filterHandlers(this.pluginHandlers[handlerType], pluginName)
  }

  /**
   * Get the last configured handler for the specified action (and optionally module type).
   */
  async getPluginHandler<T extends keyof WrappedPluginHandlers>({
    handlerType,
    pluginName,
    defaultHandler,
    throwIfMissing = true,
  }: {
    handlerType: T
    pluginName: string
    defaultHandler?: ProviderHandlers[T]
    throwIfMissing?: boolean
  }): Promise<WrappedPluginHandlers[T] | null> {
    const handlers = Object.values(await this.getPluginHandlers(handlerType, pluginName))

    // Since we only allow retrieving by plugin name, the length is always either 0 or 1
    if (handlers.length) {
      this.garden.log.silly(() => `Found '${handlerType}' handler on '${pluginName}'`)
      return handlers[handlers.length - 1]
    } else if (defaultHandler) {
      this.garden.log.silly(() => `Returned default '${handlerType}' handler for '${pluginName}'`)
      return Object.assign(
        // TODO: figure out why we need the cast here
        <WrappedPluginHandlers[T]>defaultHandler,
        { handlerType, pluginName: defaultProvider.name }
      )
    }

    if (!throwIfMissing) {
      return null
    }

    if (pluginName) {
      throw new PluginError({
        message: `Plugin '${pluginName}' does not have a '${handlerType}' handler.`,
      })
    } else {
      throw new ParameterError({
        message: `No '${handlerType}' handler configured in environment '${this.garden.environmentName}'. Are you missing a provider configuration?`,
      })
    }
  }
}

type WrappedPluginHandlers = {
  [P in keyof ProviderActionParams]: WrappedActionHandler<ProviderActionParams[P], ProviderActionOutputs[P]>
}

interface WrappedActionHandlerMap<T extends keyof WrappedPluginHandlers> {
  [actionName: string]: WrappedPluginHandlers[T]
}

type WrappedPluginActionMap = {
  [A in keyof WrappedPluginHandlers]: {
    [pluginName: string]: WrappedPluginHandlers[A]
  }
}

// avoid having to specify common params on each action helper call
type ActionRouterParams<T extends PluginActionParamsBase> = Omit<T, CommonParams> & {
  pluginName?: string
  events?: PluginEventBroker
}

type RequirePluginName<T> = T & { pluginName: string }
