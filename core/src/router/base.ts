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
  WrappedActionHandler,
} from "../plugin/base"
import { GardenPlugin, ActionHandler, PluginMap } from "../plugin/plugin"
import { PluginEventBroker } from "../plugin-context"
import { ConfigContext } from "../config/template-contexts/base"
import { BaseAction } from "../actions/base"
import { ActionKind, BaseActionConfig, Resolved } from "../actions/types"
import {
  ActionTypeDefinition,
  ActionClassMap,
  GetActionTypeHandler,
  getActionTypeHandlerDescriptions,
  GetActionTypeResults,
  WrappedActionTypeHandler,
  ActionTypeClasses,
  GetActionTypeParams,
} from "../plugin/action-types"
import { InternalError, ParameterError, PluginError } from "../exceptions"
import { validateSchema } from "../config/validation"
import { getActionTypeBases, getPluginBases, getPluginDependencies } from "../plugins"
import { getNames } from "../util/util"
import { defaultProvider } from "../config/provider"
import { ConfigGraph } from "../graph/config-graph"
import { ActionConfigContext, ActionSpecContext } from "../config/template-contexts/actions"

export type CommonParams = keyof PluginActionContextParams
export type RequirePluginName<T> = T & { pluginName: string }

export interface BaseRouterParams {
  garden: Garden
  configuredPlugins: GardenPlugin[]
  loadedPlugins: GardenPlugin[]
}

/**
 * The ProviderRouter is extended upon in BaseAction-, Module- and Provider routers.
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

  protected async commonParams(
    handler: WrappedActionHandler<any, any> | WrappedActionTypeHandler<any, any>,
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

    const wrapped = Object.assign(
      async (params: any) => {
        // Override the base parameter, to recursively allow each base to call its base.
        return handler({ ...params, base })
      },
      { ...handler, base, wrapped: handler }
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

type CommonHandlers = "configure" | "validate" | "getOutputs"

type HandlerMap<K extends ActionKind> = {
  [T in keyof ActionTypeClasses<K>]: {
    [actionType: string]: {
      [pluginName: string]: WrappedActionTypeHandler<ActionTypeClasses<K>[T], any>
    }
  }
}

type HandlerParams<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = Omit<
  GetActionTypeParams<ActionTypeClasses<K>[H]>,
  CommonParams | "artifactsPath"
> & {
  graph: ConfigGraph
  pluginName?: string
}

type WrapRouterHandler<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = {
  (params: HandlerParams<K, H>): Promise<GetActionTypeResults<ActionTypeClasses<K>[H]>>
}

export type WrappedActionRouterHandlers<K extends ActionKind> = {
  [H in keyof Omit<ActionTypeClasses<K>, CommonHandlers>]: WrapRouterHandler<K, H>
}

type ActionRouterHandler<K extends ActionKind, H extends keyof ActionTypeClasses<K>> = {
  (
    params: Omit<GetActionTypeParams<ActionTypeClasses<K>[H]>, CommonParams | "artifactsPath"> & {
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
  handlers: Omit<ActionRouterHandlers<K>, CommonHandlers>
): ActionKindRouter<K> {
  class Router extends BaseActionRouter<K> {}
  const router = new Router(kind, baseParams)

  const wrapped = mapValues(handlers, (h, key) => {
    const handler = (params: any) => {
      return h({ ...params, router, garden: baseParams.garden, handlers: wrapped })
    }
    router[key] = handler
    return handler
  })

  return router as ActionKindRouter<K>
}

export type ActionKindRouter<K extends ActionKind> = BaseActionRouter<K> & WrappedActionRouterHandlers<K>

export abstract class BaseActionRouter<K extends ActionKind> extends BaseRouter {
  protected readonly handlers: HandlerMap<K>
  protected readonly handlerDescriptions: { [N in keyof ActionTypeClasses<K>]: ResolvedActionHandlerDescription }
  protected readonly definitions: { [name: string]: ActionTypeDefinition<any> }

  constructor(protected readonly kind: K, params: BaseRouterParams) {
    super(params)

    this.handlerDescriptions = <any>getActionTypeHandlerDescriptions(kind)
    const handlerNames: (keyof ActionTypeClasses<K>)[] = <any>Object.keys(this.handlerDescriptions)
    this.handlers = <any>fromPairs(handlerNames.map((n) => [n, {}]))
    this.definitions = {}

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
          handler && this.addHandler(plugin, handlerType, spec.name, handler)
        }
      }
    }
  }

  async configure({ config, log }: { config: BaseActionConfig; log: LogEntry }) {
    if (config.kind !== this.kind) {
      throw new InternalError(`Attempted to call ${this.kind} handler for ${config.kind} action`, {})
    }

    // TODO-G2B: work out why this cast is needed
    const defaultHandler: any = async (params) => {
      return { config: params.config }
    }

    const handler = await this.getHandler({
      handlerType: "configure",
      actionType: config.type,
      defaultHandler,
    })

    const templateContext = new ActionConfigContext(this.garden)

    const commonParams = await this.commonParams(handler, log, templateContext)

    // Note: this is called by preprocessActionConfig(), and outputs are validated there
    return handler({
      ...commonParams,
      config,
    })
  }

  async callHandler<T extends keyof ActionTypeClasses<K>>({
    params,
    handlerType,
    defaultHandler,
  }: {
    params: {
      action: ActionClassMap[K] | Resolved<ActionClassMap[K]>
      pluginName?: string
      log: LogEntry
      graph: ConfigGraph
    } & Omit<GetActionTypeParams<ActionTypeClasses<K>[T]>, keyof PluginActionParamsBase>
    handlerType: T
    defaultHandler?: GetActionTypeHandler<ActionTypeClasses<K>[T], T>
  }): Promise<GetActionTypeResults<ActionTypeClasses<K>[T]>> {
    const { action, pluginName, log, graph } = params

    log.silly(`Getting '${String(handlerType)}' handler for ${action.longDescription()}`)

    if (action.kind !== this.kind) {
      throw new InternalError(`Attempted to call ${this.kind} handler for ${action.kind} action`, {})
    }

    const handler = await this.getHandler({
      actionType: action.type,
      handlerType,
      pluginName,
      defaultHandler,
    })

    const providers = await this.garden.resolveProviders(log)
    const templateContext = action.isResolved()
      ? new ActionSpecContext({
          garden: this.garden,
          resolvedProviders: providers,
          action,
          partialRuntimeResolution: false,
          modules: graph.getModules(),
          executedDependencies: action.getExecutedDependencies(),
          variables: action.getVariables(),
        })
      : new ActionConfigContext(this.garden)

    const handlerParams = {
      ...(await this.commonParams(handler, params.log, templateContext)),
      ...params,
    }

    log.silly(`Calling ${String(handlerType)} handler for action ${action.longDescription()}`)

    const result: GetActionTypeResults<ActionTypeClasses<K>[T]> = await handler(handlerParams)

    // Validate result
    // TODO-G2

    return result
  }

  async validateActionOutputs<T extends BaseAction>(action: T, outputs: any) {
    const actionTypes = await this.garden.getActionTypes()
    const spec: ActionTypeDefinition<any> = actionTypes[action.kind][action.type]

    if (spec.outputs?.schema) {
      outputs = validateSchema(outputs, spec.outputs.schema, {
        context: `outputs from ${action.kind} '${action.name}'`,
        ErrorClass: PluginError,
      })
    }

    for (const base of getActionTypeBases(spec, actionTypes[action.kind])) {
      if (base.outputs?.schema) {
        outputs = validateSchema(outputs, base.outputs.schema.unknown(true), {
          context: `outputs from ${action.kind} '${action.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: PluginError,
        })
      }
    }
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
            `Got empty response from ${actionType}.${String(handlerType)} handler on ${pluginName} provider`,
            {
              args,
              handlerType,
              pluginName,
            }
          )
        }
        return validateSchema(result, schema, {
          context: `${String(handlerType)} ${actionType} output from provider ${pluginName}`,
        })
      })),
      { handlerType, pluginName, actionType }
    )

    wrapped.base = this.wrapBase(handler.base)

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
    const handlers: WrappedActionTypeHandler<ActionTypeClasses<K>[T], T>[] = Object.values(
      this.handlers[handlerType][actionType] || {}
    )
    const spec = this.definitions[actionType]

    if (handlers.length === 0 && spec.base && !pluginName) {
      // No handler found but module type has a base. Check if the base type has the handler we're looking for.
      this.garden.log.silly(
        `No ${String(handlerType)} handler found for ${actionType} ${this.kind} type. Trying ${spec.base} base.`
      )

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
          `Unable to find any matching configuration when selecting ${actionType}/${String(handlerType)} handler ` +
            `(please report this as a bug).`,
          { handlers, configs }
        )
      } else {
        return filtered[0]
      }
    } else if (defaultHandler) {
      this.garden.log.silly(
        `No ${String(handlerType)} handler found for ${actionType} ${this.kind} type. Using default handler.`
      )
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
          `Plugin '${pluginName}' does not have a '${String(handlerType)}' handler for action type '${actionType}'.`,
          errorDetails
        )
      } else {
        throw new ParameterError(
          `No '${String(handlerType)}' handler configured for actionType type '${actionType}' in environment ` +
            `'${this.garden.environmentName}'. Are you missing a provider configuration?`,
          errorDetails
        )
      }
    }
  }
}
