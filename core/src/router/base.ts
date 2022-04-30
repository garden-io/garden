/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { fromPairs, keyBy, mapValues, pickBy } from "lodash"

import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import {
  NamespaceStatus,
  PluginActionContextParams,
  PluginActionParamsBase,
  ResolvedActionHandlerDescription,
} from "../plugin/base"
import { GardenPlugin, WrappedActionHandler, ActionHandler, PluginMap } from "../plugin/plugin"
import { PluginEventBroker } from "../plugin-context"
import { ConfigContext } from "../config/template-contexts/base"
import { ActionKind } from "../actions/base"
import {
  ActionTypeDefinition,
  ActionTypeMap,
  GetActionTypeHandler,
  getActionTypeHandlerDescriptions,
  GetActionTypeResults,
  WrappedActionTypeHandler,
  ActionTypeClasses,
  GetActionTypeParams,
} from "../plugin/action-types"
import { InternalError, ParameterError, PluginError } from "../exceptions"
import { validateSchema } from "../config/validation"
import { getPluginBases, getPluginDependencies } from "../plugins"
import { getNames } from "../util/util"
import { defaultProvider } from "../config/provider"
import { ConfigGraph } from "../graph/config-graph"

export type CommonParams = keyof PluginActionContextParams
export type RequirePluginName<T> = T & { pluginName: string }

export interface BaseRouterParams {
  garden: Garden
  configuredPlugins: GardenPlugin[]
  loadedPlugins: GardenPlugin[]
}

/**
 * The ProviderRouter takes care of choosing which plugin should be responsible for handling a provider action,
 * and preparing common parameters (so as to reduce boilerplate on the usage side).
 *
 * Each provider handler has a corresponding method on this class.
 */
export abstract class BaseRouter {
  protected readonly garden: Garden
  protected readonly configuredPlugins: GardenPlugin[]
  protected readonly loadedPlugins: PluginMap

  constructor(params: BaseRouterParams) {
    this.garden = params.garden
    this.configuredPlugins = params.configuredPlugins
    this.loadedPlugins = keyBy(params.loadedPlugins, "name")
  }

  emitNamespaceEvents(namespaceStatuses: NamespaceStatus[] | undefined) {
    if (namespaceStatuses && namespaceStatuses.length > 0) {
      for (const status of namespaceStatuses) {
        this.emitNamespaceEvent(status)
      }
    }
  }

  emitNamespaceEvent(namespaceStatus: NamespaceStatus | undefined) {
    if (namespaceStatus) {
      const { pluginName, state, namespaceName } = namespaceStatus
      this.garden.events.emit("namespaceStatus", { pluginName, state, namespaceName })
    }
  }

  // TODO: find a nicer way to do this (like a type-safe wrapper function)
  protected async commonParams(
    handler: WrappedActionHandler<any, any>,
    log: LogEntry,
    templateContext?: ConfigContext,
    events?: PluginEventBroker
  ): Promise<PluginActionParamsBase> {
    const provider = await this.garden.resolveProvider(log, handler.pluginName)

    return {
      ctx: await this.garden.getPluginContext(provider, templateContext, events),
      log,
      base: handler.base,
    }
  }

  /**
   * Recursively wraps the base handler (if any) on an action handler, such that the base handler receives the _next_
   * base handler as the `base` parameter when called from within the handler.
   */
  protected wrapBase<T extends ActionHandler<any, any>>(handler?: T): T | undefined {
    if (!handler) {
      return undefined
    }

    const base = this.wrapBase(handler.base)

    const wrapped = <T>Object.assign(
      async (params: any) => {
        // Override the base parameter, to recursively allow each base to call its base.
        return handler({ ...params, base })
      },
      { ...handler, base }
    )

    return wrapped
  }

  protected async filterHandlers(handlers: any, pluginName?: string) {
    // make sure plugin is loaded
    if (!!pluginName) {
      await this.garden.getPlugin(pluginName)
    }

    if (handlers === undefined) {
      handlers = {}
    }

    return !pluginName ? handlers : pickBy(handlers, (handler) => handler.pluginName === pluginName)
  }
}

type HandlerMap<K extends ActionKind> = {
  [T in keyof ActionTypeClasses<K>]: {
    [actionType: string]: {
      [pluginName: string]: WrappedActionTypeHandler<ActionTypeClasses<K>, T>
    }
  }
}

type HandlerParams<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = Omit<
  GetActionTypeParams<ActionTypeClasses<K>[H]>,
  CommonParams
> & {
  graph: ConfigGraph
  pluginName?: string
}

type WrapRouterHandler<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = {
  (params: HandlerParams<K, H>): Promise<GetActionTypeResults<ActionTypeClasses<K>[H]>>
}

export type WrappedActionRouterHandlers<K extends ActionKind> = {
  [H in keyof ActionTypeClasses<K>]: WrapRouterHandler<K, H>
}

type ActionRouterHandler<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = {
  (
    params: Omit<GetActionTypeParams<ActionTypeClasses<K>[H]>, CommonParams> & {
      router: BaseActionRouter<K>
      garden: Garden
      graph: ConfigGraph
      handlers: WrappedActionRouterHandlers<K>
      pluginName?: string
    }
  ): Promise<GetActionTypeResults<ActionTypeClasses<K>[H]>>
}

export type ActionRouterHandlers<K extends ActionKind> = {
  [H in keyof ActionTypeClasses<K>]: ActionRouterHandler<K, H>
}

export function createActionRouter<K extends ActionKind>(
  kind: K,
  baseParams: BaseRouterParams,
  handlers: ActionRouterHandlers<K>
): WrappedActionRouterHandlers<K> {
  class Router extends BaseActionRouter<K> {}
  const router = new Router(kind, baseParams)

  const wrapped = mapValues(handlers, (h) => {
    return (params: any) => {
      return h({ ...params, router, garden: baseParams.garden, handlers: wrapped })
    }
  })

  return wrapped
}

export abstract class BaseActionRouter<K extends ActionKind> extends BaseRouter {
  protected readonly handlers: HandlerMap<K>
  protected readonly handlerDescriptions: { [N in keyof ActionTypeClasses<K>]: ResolvedActionHandlerDescription }
  protected readonly definitions: { [name: string]: ActionTypeDefinition<any> }

  constructor(protected readonly kind: K, params: BaseRouterParams) {
    super(params)

    this.handlerDescriptions = <any>getActionTypeHandlerDescriptions()[kind]
    const handlerNames: (keyof ActionTypeClasses<K>)[] = <any>Object.keys(this.handlerDescriptions)
    this.handlers = <any>fromPairs(handlerNames.map((n) => [n, {}]))

    for (const plugin of params.configuredPlugins) {
      const created = <any>plugin.createActionTypes[kind] || []
      for (const spec of created) {
        this.definitions[spec.name] = spec
        for (const handlerType of handlerNames) {
          const handler = spec.handlers[handlerType]
          handler && this.addHandler(plugin, handlerType, spec.name, handler)
        }
      }

      const extended = <any>plugin.extendActionTypes[kind] || []
      for (const spec of extended) {
        for (const handlerType of handlerNames) {
          const handler = spec.handlers[handlerType]
          handler && this.addHandler(plugin, <any>handlerType, spec.name, handler)
        }
      }
    }
  }

  async callHandler<T extends keyof ActionTypeClasses<K>>({
    params,
    handlerType,
    defaultHandler,
  }: {
    params: {
      action: ActionTypeMap[K]
      pluginName?: string
      log: LogEntry
      graph: ConfigGraph
    }
    handlerType: T
    defaultHandler?: GetActionTypeHandler<any, any>
  }): Promise<GetActionTypeResults<ActionTypeClasses<K>[T]>> {
    const { action, pluginName, log, graph } = params

    log.silly(`Getting '${handlerType}' handler for ${action.description()}`)

    const handler = await this.getHandler({
      actionType: action.type,
      handlerType,
      pluginName,
      defaultHandler,
    })

    const providers = await this.garden.resolveProviders(log)
    const templateContext = ActionConfigContext.fromAction({
      garden: this.garden,
      resolvedProviders: providers,
      action,
      graph,
      partialRuntimeResolution: false,
    })
    const handlerParams = {
      ...(await this.commonParams(handler, params.log, templateContext)),
      ...params,
    }

    log.silly(`Calling ${handlerType} handler for action ${action.description()}`)

    const result: GetActionTypeResults<ActionTypeClasses<K>[T]> = await handler(handlerParams)

    // TODO-G2: validate outputs here

    return result
  }

  private addHandler<T extends keyof ActionTypeClasses<K>>(
    plugin: GardenPlugin,
    handlerType: T,
    actionType: string,
    handler: GetActionTypeHandler<ActionTypeClasses<K>[T], any>
  ) {
    const pluginName = plugin.name
    const schema = this.handlerDescriptions[handlerType].resultSchema

    // Wrap the handler with identifying attributes
    const wrapped = Object.assign(
      <WrappedActionTypeHandler<ActionTypeClasses<K>[T], any>>(<unknown>(async (...args: any[]) => {
        const result = await handler["apply"](plugin, args)
        if (result === undefined) {
          throw new PluginError(
            `Got empty response from ${actionType}.${handlerType} handler on ${pluginName} provider`,
            {
              args,
              handlerType,
              pluginName,
            }
          )
        }
        return validateSchema(result, schema, {
          context: `${handlerType} ${actionType} output from provider ${pluginName}`,
        })
      })),
      { handlerType, pluginName, moduleType: actionType }
    )

    wrapped.base = this.wrapBase(handler.base)

    if (!this.handlers[handlerType]) {
      this.handlers[handlerType] = {}
    }

    if (!this.handlers[handlerType][actionType]) {
      // I'm not sure why we need the cast here - JE
      const handlers: any = this.handlers
      handlers[handlerType][actionType] = {}
    }

    this.handlers[handlerType][actionType][pluginName] = wrapped
  }

  /**
   * Get the configured handler for the specified action.
   */
  async getHandler<T extends keyof ActionTypeClasses<K>>({
    handlerType,
    actionType,
    pluginName,
    defaultHandler,
  }: {
    handlerType: T
    actionType: string
    pluginName?: string
    defaultHandler?: GetActionTypeHandler<ActionTypeClasses<K>[T], T>
  }): Promise<WrappedActionTypeHandler<ActionTypeClasses<K>[T], T>> {
    const handlers: WrappedActionTypeHandler<ActionTypeClasses<K>[T], T>[] = []
    const spec = this.definitions[actionType]

    if (handlers.length === 0 && spec.base && !pluginName) {
      // No handler found but module type has a base. Check if the base type has the handler we're looking for.
      this.garden.log.silly(`No ${handlerType} handler found for ${actionType}. Trying ${spec.base} base.`)

      return this.getHandler({
        handlerType,
        actionType: spec.base,
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
            if (handler["pluginName"] === config.name) {
              return handler
            }
          }
        }

        // This should never happen
        throw new InternalError(
          `Unable to find any matching configuration when selecting ${actionType}/${handlerType} handler ` +
            `(please report this as a bug).`,
          { handlers, configs }
        )
      } else {
        return filtered[0]
      }
    } else if (defaultHandler) {
      // Return the default handler, but wrap it to match the expected interface.
      return Object.assign(defaultHandler, {
        handlerType,
        actionType,
        pluginName: defaultProvider.name,
      })
    } else {
      // Nothing matched, throw error.
      const errorDetails = {
        requestedHandlerType: handlerType,
        requestedActionType: actionType,
        environment: this.garden.environmentName,
        pluginName,
      }

      if (pluginName) {
        throw new PluginError(
          `Plugin '${pluginName}' does not have a '${handlerType}' handler for action type '${actionType}'.`,
          errorDetails
        )
      } else {
        throw new ParameterError(
          `No '${handlerType}' handler configured for actionType type '${actionType}' in environment ` +
            `'${this.garden.environmentName}'. Are you missing a provider configuration?`,
          errorDetails
        )
      }
    }
  }
}
