/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  PluginMap,
  GardenPlugin,
  ModuleTypeDefinition,
  ModuleTypeExtension,
  pluginSchema,
  RegisterPluginParam,
  pluginNodeModuleSchema,
  GardenPluginReference,
} from "./plugin/plugin"
import type { GenericProviderConfig } from "./config/provider"
import { ConfigurationError, PluginError, RuntimeError } from "./exceptions"
import { uniq, mapValues, fromPairs, flatten, keyBy, some, isString, sortBy, Dictionary } from "lodash"
import { findByName, pushToKey, getNames, isNotNull, MaybeUndefined } from "./util/util"
import { deline } from "./util/string"
import { validateSchema } from "./config/validation"
import type { Log } from "./logger/log-entry"
import { DependencyGraph } from "./graph/common"
import { parse, resolve } from "path"
import Bluebird from "bluebird"
import { ModuleTypeMap, getModuleTypeBases } from "./types/module"
import { ActionKind, actionKinds } from "./actions/types"
import type {
  ActionTypeDefinition,
  ActionTypeDefinitions,
  ActionTypeExtensions,
  ManyActionTypeDefinitions,
  ManyActionTypeExtensions,
} from "./plugin/action-types"
import { ObjectSchema } from "@hapi/joi"

export async function loadAndResolvePlugins(
  log: Log,
  projectRoot: string,
  registeredPlugins: RegisterPluginParam[],
  configs: GenericProviderConfig[]
) {
  const loadedPlugins = keyBy(await Bluebird.map(registeredPlugins, (p) => loadPlugin(log, projectRoot, p)), "name")

  return resolvePlugins(log, loadedPlugins, configs)
}

export function resolvePlugins(
  log: Log,
  loadedPlugins: Dictionary<GardenPlugin>,
  configs: GenericProviderConfig[]
): GardenPlugin[] {
  const initializedPlugins: PluginMap = {}
  const validatePlugin = (name: string) => {
    if (initializedPlugins[name]) {
      return initializedPlugins[name]
    }

    log.silly(`Validating plugin ${name}`)
    let plugin = loadedPlugins[name]

    if (!plugin) {
      return null
    }

    plugin = validateSchema(plugin, pluginSchema(), {
      context: `plugin "${name}"`,
    })

    initializedPlugins[name] = plugin

    if (plugin.base) {
      if (plugin.base === plugin.name) {
        throw new PluginError(`Plugin '${plugin.name}' references itself as a base plugin.`, {
          pluginName: plugin.name,
        })
      }

      const base = validatePlugin(plugin.base)

      if (!base) {
        throw new PluginError(
          `Plugin '${plugin.name}' specifies plugin '${plugin.base}' as a base, ` +
            `but that plugin has not been registered.`,
          { loadedPlugins: Object.keys(loadedPlugins), base: plugin.base }
        )
      }

      // Inherit config schema for base if none is specified
      if (!plugin.configSchema) {
        plugin.configSchema = base.configSchema
      }
    }

    for (const dep of plugin.dependencies || []) {
      const depPlugin = validatePlugin(dep.name)

      if (!depPlugin && !dep.optional) {
        throw new PluginError(
          `Plugin '${plugin.name}' lists plugin '${dep.name}' as a dependency,
          but that plugin has not been registered.`,
          { loadedPlugins: Object.keys(loadedPlugins), dependency: dep }
        )
      }
    }

    for (const kind of actionKinds) {
      for (const spec of plugin.createActionTypes[kind]) {
        const { runtimeOutputsSchema, staticOutputsSchema } = spec
        validateOutputSchemas(plugin, runtimeOutputsSchema, staticOutputsSchema)
      }
    }

    log.silly(`Done loading plugin ${name}`)

    return plugin
  }

  // Load plugins in dependency order
  const configsByName = keyBy(configs, "name")
  const orderedPlugins = getDependencyOrder(loadedPlugins)

  for (const name of orderedPlugins) {
    const plugin = validatePlugin(name)

    if (!plugin && configsByName[name]) {
      throw new ConfigurationError(`Configured provider '${name}' has not been registered.`, {
        name,
        availablePlugins: Object.keys(loadedPlugins),
      })
    }
  }

  // Resolve plugins against their base plugins
  let resolvedPlugins = mapValues(initializedPlugins, (p) => resolvePlugin(p, initializedPlugins, configs))

  // Resolve module and action type definitions
  resolvedPlugins = resolveModuleDefinitions(resolvedPlugins, configs)

  for (const kind of actionKinds) {
    resolvedPlugins = resolveActionTypeDefinitions({ resolvedPlugins, configs, kind })
  }

  return Object.values(resolvedPlugins)
}

function validateOutputSchemas(
  plugin: GardenPlugin,
  runtimeOutputsSchema?: ObjectSchema,
  staticOutputsSchema?: ObjectSchema
) {
  const unknownFlagIsSet = staticOutputsSchema?.$_getFlag("unknown")
  if (unknownFlagIsSet) {
    throw new PluginError(`Plugin '${plugin.name}' allows unknown keys in the staticOutputsSchema`, {})
  }

  const runtimeSchema = Object.keys(runtimeOutputsSchema?.describe().keys || {})
  const staticSchema = Object.keys(staticOutputsSchema?.describe().keys || {})
  const commonKeys = runtimeSchema.filter((value) => staticSchema.includes(value))
  if (commonKeys.length > 0) {
    throw new PluginError(
      `Plugin '${plugin.name}' has overlapping keys in staticOutputsSchema and runtimeOutputsSchema`,
      { commonKeys }
    )
  }
}

export async function loadPlugin(log: Log, projectRoot: string, nameOrPlugin: RegisterPluginParam) {
  let plugin: GardenPlugin

  if (isString(nameOrPlugin)) {
    let moduleNameOrLocation = nameOrPlugin

    // allow relative references to project root
    if (parse(moduleNameOrLocation).dir !== "") {
      moduleNameOrLocation = resolve(projectRoot, moduleNameOrLocation)
    }

    let pluginModule: any

    try {
      pluginModule = require(moduleNameOrLocation)
    } catch (error) {
      throw new ConfigurationError(
        `Unable to load plugin "${moduleNameOrLocation}" (could not load module: ${error.message})`,
        {
          message: error.message,
          moduleNameOrLocation,
        }
      )
    }

    try {
      pluginModule = validateSchema(pluginModule, pluginNodeModuleSchema(), {
        context: `plugin module "${moduleNameOrLocation}"`,
      })
    } catch (err) {
      throw new PluginError(`Unable to load plugin: ${err}`, {
        moduleNameOrLocation,
        err,
      })
    }

    plugin = pluginModule.gardenPlugin
  } else if (nameOrPlugin["callback"]) {
    plugin = (<GardenPluginReference>nameOrPlugin).callback()
  } else {
    plugin = <GardenPlugin>nameOrPlugin
  }

  log.silly(`Loaded plugin ${plugin.name}`)

  return plugin
}

/**
 * Returns the given provider plugins in dependency order.
 */
export function getDependencyOrder(loadedPlugins: PluginMap): string[] {
  const graph = new DependencyGraph()

  for (const plugin of Object.values(loadedPlugins)) {
    graph.addNode(plugin.name)

    if (plugin.base) {
      graph.addNode(plugin.base)
      graph.addDependency(plugin.name, plugin.base)
    }

    for (const dep of plugin.dependencies || []) {
      graph.addNode(dep.name)
      graph.addDependency(plugin.name, dep.name)
    }
  }

  const cycles = graph.detectCircularDependencies()

  if (cycles.length > 0) {
    const description = graph.cyclesToString(cycles)
    const detail = { "circular-dependencies": description }
    throw new PluginError(`Found a circular dependency between registered plugins:\n\n${description}`, detail)
  }

  return graph.overallOrder()
}

// Takes a plugin and resolves it against its base plugin, if applicable
function resolvePlugin(plugin: GardenPlugin, loadedPlugins: PluginMap, configs: GenericProviderConfig[]): GardenPlugin {
  if (!plugin.base) {
    return plugin
  }

  // Resolve the plugin base
  let base = loadedPlugins[plugin.base]
  base = resolvePlugin(base, loadedPlugins, configs)

  const baseIsConfigured = getNames(configs).includes(plugin.base)

  const resolved = {
    outputsSchema: base.outputsSchema,
    ...plugin,
  }

  // Merge dependencies with base and sort
  resolved.dependencies = []

  for (const dep of [...(plugin.dependencies || []), ...(base.dependencies || [])]) {
    const duplicate = resolved.dependencies.find((d) => d.name === dep.name)
    if (duplicate) {
      if (!dep.optional) {
        duplicate.optional = false
      }
    } else {
      resolved.dependencies.push(dep)
    }
  }

  resolved.dependencies = sortBy(resolved.dependencies, "name")

  // Merge plugin handlers
  resolved.handlers = { ...(plugin.handlers || {}) }

  for (const [name, handler] of Object.entries(base.handlers || {})) {
    if (!handler) {
      continue
    } else if (resolved.handlers[name]) {
      // Attach the overridden handler as a base, and attach metadata
      resolved.handlers[name].base = Object.assign(handler, { handlerType: name, pluginName: base.name })
    } else {
      resolved.handlers[name] = handler
    }
  }

  // Merge commands
  resolved.commands = [...plugin.commands]

  for (const baseCommand of base.commands) {
    const command = findByName(resolved.commands, baseCommand.name)
    if (command) {
      command.base = baseCommand
    } else {
      resolved.commands.push(baseCommand)
    }
  }

  // Add tools from base (unless they're overridden, in which case we ignore the one from the base)
  resolved.tools = [...(plugin.tools || [])]

  for (const baseTool of base.tools || []) {
    const tool = findByName(resolved.tools, baseTool.name)
    if (!tool) {
      resolved.tools.push(baseTool)
    }
  }

  // If the base is not expressly configured for the environment, we pull and coalesce its module+action declarations.
  // We also make sure the plugin doesn't redeclare a module or action type from the base.
  resolved.createModuleTypes = [...plugin.createModuleTypes]
  resolved.extendModuleTypes = [...plugin.extendModuleTypes]

  for (const spec of base.createModuleTypes) {
    if (findByName(plugin.createModuleTypes, spec.name)) {
      throw new PluginError(
        `Plugin '${plugin.name}' redeclares the '${spec.name}' module type, already declared by its base.`,
        { plugin, base }
      )
    } else if (!baseIsConfigured) {
      // Base is not explicitly configured, so we pluck the module type definition
      resolved.createModuleTypes.push(spec)
    }
  }

  resolved.createActionTypes = {
    Build: [...plugin.createActionTypes.Build],
    Deploy: [...plugin.createActionTypes.Deploy],
    Run: [...plugin.createActionTypes.Run],
    Test: [...plugin.createActionTypes.Test],
  }

  resolved.extendActionTypes = {
    Build: [...plugin.extendActionTypes.Build],
    Deploy: [...plugin.extendActionTypes.Deploy],
    Run: [...plugin.extendActionTypes.Run],
    Test: [...plugin.extendActionTypes.Test],
  }

  for (const kind of actionKinds) {
    for (const spec of base.createActionTypes[kind]) {
      if (findByName(<any>plugin.createActionTypes[kind], spec.name)) {
        throw new PluginError(
          `Plugin '${plugin.name}' redeclares the '${spec.name}' ${kind} type, already declared by its base.`,
          { plugin, base }
        )
      } else if (!baseIsConfigured) {
        // Base is not explicitly configured, so we pluck the action type definition
        resolved.createActionTypes[kind].push(<any>spec)
      }
    }
  }

  if (!baseIsConfigured) {
    // Base is not explicitly configured, so we coalesce the module+action type extensions
    for (const baseSpec of base.extendModuleTypes) {
      const spec = findByName(plugin.extendModuleTypes, baseSpec.name)
      if (spec) {
        // Both plugin and base extend the module type, coalesce them
        for (const [name, baseHandler] of Object.entries(baseSpec.handlers)) {
          // Pull in handler from base, if it's not specified in the plugin
          if (!spec.handlers[name]) {
            spec.handlers[name] = cloneHandler(baseHandler)
          }
        }
      } else {
        // Only base has the extension for this type, pull it directly
        resolved.extendModuleTypes.push(baseSpec)
      }
    }

    for (const kind of actionKinds) {
      for (const baseSpec of base.extendActionTypes[kind]) {
        const spec = findByName(<any>plugin.extendActionTypes[kind], baseSpec.name)
        if (spec) {
          // Both plugin and base extend the module type, coalesce them
          for (const [name, baseHandler] of Object.entries(baseSpec.handlers)) {
            // Pull in handler from base, if it's not specified in the plugin
            if (!spec.handlers[name]) {
              spec.handlers[name] = cloneHandler(baseHandler)
            }
          }
        } else {
          // Only base has the extension for this type, pull it directly
          resolved.extendActionTypes[kind].push(<any>baseSpec)
        }
      }
    }
  }

  return resolved
}

/**
 * Recursively resolves all the bases for the given plugin.
 */
export function getPluginBases(plugin: GardenPlugin, loadedPlugins: PluginMap): GardenPlugin[] {
  if (!plugin.base) {
    return []
  }

  const base = loadedPlugins[plugin.base]

  if (!base) {
    throw new RuntimeError(`Unable to find base plugin '${plugin.base}' for plugin '${plugin.name}'`, { plugin })
  }

  return [base, ...getPluginBases(base, loadedPlugins)]
}

/**
 * Recursively resolves all the base names for the given plugin.
 */
export function getPluginBaseNames(name: string, loadedPlugins: PluginMap) {
  return getPluginBases(loadedPlugins[name], loadedPlugins).map((p) => p.name)
}

/**
 * Recursively resolves all the bases for the given action type, ordered from closest base to last.
 */
export function getActionTypeBases(
  type: MaybeUndefined<ActionTypeDefinition<any>>,
  actionTypes: ActionTypeDefinitionMap<any>
): ActionTypeDefinition<any>[] {
  if (!type || !type.base) {
    return []
  }

  const base = actionTypes[type.base]?.spec

  if (!base) {
    throw new RuntimeError(`Unable to find base action type '${type.base}' for actionTypes type '${type.name}'`, {
      name: type.name,
      actionTypes,
    })
  }

  return [base, ...getActionTypeBases(base, actionTypes)]
}

/**
 * Recursively get all declared dependencies for the given plugin,
 * i.e. direct dependencies, and dependencies of those dependencies etc.
 */
export function getPluginDependencies(plugin: GardenPlugin, loadedPlugins: PluginMap): GardenPlugin[] {
  return uniq(
    flatten(
      (plugin.dependencies || []).map((dep) => {
        const depPlugin = loadedPlugins[dep.name]
        if (depPlugin) {
          return [depPlugin, ...getPluginDependencies(depPlugin, loadedPlugins)]
        } else if (dep.optional) {
          return []
        } else {
          throw new RuntimeError(`Unable to find dependency '${dep.name} for plugin '${plugin.name}'`, { plugin })
        }
      })
    )
  )
}

export type ActionTypeMap<T> = {
  [K in ActionKind]: {
    [type: string]: MaybeUndefined<T>
  }
}

export type ActionTypeDefinitionMap<K extends ActionKind> = {
  [type: string]: { spec: ActionTypeDefinitions[K]; plugin: GardenPlugin }
}

export type ActionDefinitionMap = {
  [K in ActionKind]: ActionTypeDefinitionMap<K>
}

/**
 * Returns all the action types defined in the given list of plugins.
 */
export function getActionTypes(plugins: GardenPlugin[]): ActionDefinitionMap {
  const map: ActionDefinitionMap = {
    Build: {},
    Deploy: {},
    Run: {},
    Test: {},
  }

  for (const plugin of plugins) {
    for (const k of actionKinds) {
      for (const spec of plugin.createActionTypes[k]) {
        map[k][spec.name] = { spec: <any>spec, plugin }
      }
    }
  }

  return map
}

function resolveActionTypeDefinitions<K extends ActionKind>({
  resolvedPlugins,
  configs,
  kind,
}: {
  resolvedPlugins: PluginMap
  configs: GenericProviderConfig[]
  kind: K
}): PluginMap {
  // Collect module type declarations
  const graph = new DependencyGraph()
  const definitionMap: { [type: string]: { plugin: GardenPlugin; spec: ActionTypeDefinitions[K] }[] } = {}
  const extensionMap: { [type: string]: { plugin: GardenPlugin; spec: ActionTypeExtensions[K] }[] } = {}

  for (const plugin of Object.values(resolvedPlugins)) {
    for (const spec of plugin.createActionTypes[kind]) {
      pushToKey(definitionMap, spec.name, { plugin, spec })

      graph.addNode(spec.name, `${spec.name} (from plugin ${plugin.name})`)

      if (spec.base) {
        graph.addNode(spec.base, `${spec.base} (from plugin ${plugin.name})`)
        graph.addDependency(spec.name, spec.base)
      }
    }

    for (const spec of plugin.extendActionTypes[kind]) {
      pushToKey(extensionMap, spec.name, { plugin, spec })
    }
  }

  // Make sure only one _configured_ plugin declares each module type
  for (const [type, definitions] of Object.entries(definitionMap)) {
    const configured = definitions.filter((d) => configs.map((c) => c.name).includes(d.plugin.name))

    if (configured.length > 1) {
      const plugins = definitions.map((d) => d.plugin.name)

      throw new ConfigurationError(`${kind} type '${type}' is declared in multiple plugins: ${plugins.join(", ")}.`, {
        type,
        plugins,
      })
    }
  }

  // Make sure we don't have circular dependencies in type bases
  const cycles = graph.detectCircularDependencies()

  if (cycles.length > 0) {
    const description = graph.cyclesToString(cycles)
    const detail = { "circular-dependencies": description }
    const msg = `Found circular dependency between ${kind} type bases:\n\n${description}`
    throw new PluginError(msg, detail)
  }

  const ordered = graph.overallOrder().filter((name) => name in definitionMap)

  const resolvedDefinitions: ActionTypeDefinitionMap<K> = {}

  // Resolve the base for each declaration (in dependency order)
  const typeDefinitions = fromPairs(
    ordered.map((name) => {
      const definitions = definitionMap[name]

      const resolved = resolveActionDefinition({
        plugin: definitions[0].plugin,
        kind,
        spec: definitions[0].spec,
        definitions: resolvedDefinitions,
        resolvedPlugins,
      })

      resolvedDefinitions[name] = resolved

      return [name, resolved]
    })
  )

  // Return the plugins with the resolved definitions
  return mapValues(resolvedPlugins, (plugin) => {
    // Validate extensions and add base handlers where appropriate
    const extensions = plugin.extendActionTypes[kind].map((spec) => {
      const moduleType = spec.name
      const definition = typeDefinitions[moduleType]

      if (!definition) {
        // Ignore if the type to extend cannot be found.
        return null
      }

      // Attach base handlers (which are the corresponding declaration handlers, if any)
      const handlers = mapValues(spec.handlers, (handler, name) => {
        const baseHandler = definition.spec.handlers[name]

        if (!handler) {
          return handler
        }

        handler = cloneHandler(handler)

        if (handler && baseHandler) {
          handler.base = cloneHandler(baseHandler)
          handler.base!.handlerType = handler.base!.handlerType || name
          handler.base!.moduleType = handler.base!.moduleType || moduleType
          handler.base!.pluginName = handler.base!.pluginName || definition.plugin.name
        }

        return handler
      })

      // Need the cast here because for some reason mapValues screws up the typing
      return <ActionTypeExtensions[K]>{
        ...spec,
        handlers,
      }
    })

    const definitions = plugin.createActionTypes[kind]

    const createActionTypes: ManyActionTypeDefinitions = {
      ...plugin.createActionTypes,
      [kind]: definitions.map((spec) => resolvedDefinitions[spec.name].spec),
    }

    const extendActionTypes: ManyActionTypeExtensions = {
      ...plugin.extendActionTypes,
      [kind]: extensions.filter(isNotNull),
    }

    return {
      ...plugin,
      createActionTypes,
      extendActionTypes,
    }
  })
}

function resolveActionDefinition<K extends ActionKind>({
  plugin,
  kind,
  spec,
  definitions,
  resolvedPlugins,
}: {
  plugin: GardenPlugin
  kind: K
  spec: ActionTypeDefinitions[K]
  definitions: ActionTypeDefinitionMap<K>
  resolvedPlugins: PluginMap
}) {
  if (!spec.base) {
    // Just attach metadata to handlers and return
    for (const [name, handler] of Object.entries(spec.handlers)) {
      if (!handler) {
        continue
      }
      handler.handlerType = name
      handler.pluginName = plugin.name
    }

    return { spec, plugin }
  }

  const baseDefinition = definitions[spec.base]

  if (!baseDefinition) {
    throw new PluginError(
      deline`
      ${kind} type '${spec.name}', defined in plugin '${plugin.name}', specifies base type '${spec.base}'
      which cannot be found. The plugin is likely missing a dependency declaration.
      Please report an issue with the author.
      `,
      { type: spec.name, baseName: spec.base, pluginName: plugin.name }
    )
  }

  const declaredBy = baseDefinition.plugin.name
  const type = spec.name
  const pluginBases = getPluginBaseNames(plugin.name, resolvedPlugins)

  if (
    declaredBy !== plugin.name &&
    !pluginBases.includes(declaredBy) &&
    !(plugin.dependencies && plugin.dependencies.find((d) => d.name === declaredBy))
  ) {
    throw new PluginError(
      deline`
      ${kind} type '${type}', defined in plugin '${plugin.name}', specifies base type '${spec.base}'
      which is defined by '${declaredBy}' but '${plugin.name}' does not specify a dependency on that plugin.
      Plugins must explicitly declare dependencies on plugins that define types they reference.
      Please report an issue with the author.
      `,
      {
        type,
        pluginName: plugin.name,
        declaredByName: declaredBy,
        bases: pluginBases,
      }
    )
  }

  const resolved: ActionTypeDefinitions[K] = {
    ...spec,
  }

  const bases = getActionTypeBases(spec, definitions)

  // Find the nearest base for each configured handler and attach it
  for (const [name, handler] of Object.entries(resolved.handlers)) {
    if (!handler) {
      continue
    }

    for (const base of bases) {
      const baseHandler = base.handlers && base.handlers[name]

      if (baseHandler) {
        handler.base = cloneHandler(baseHandler)
        handler.base!.handlerType = baseHandler!.handlerType || name
        handler.base!.pluginName = baseHandler!.pluginName || definitions[base.name]?.plugin.name
        break
      }
    }
  }

  return { spec: resolved, plugin }
}

/**
 * Returns all the module types defined in the given list of plugins.
 */
export function getModuleTypes(plugins: GardenPlugin[]): ModuleTypeMap {
  const definitions = flatten(plugins.map((p) => p.createModuleTypes.map((spec) => ({ ...spec, plugin: p }))))
  const extensions = flatten(plugins.map((p) => p.extendModuleTypes))

  return keyBy(
    definitions.map((definition) => {
      const typeExtensions = extensions.filter((e) => e.name === definition.name)
      const needsBuild = !!definition.needsBuild || some(typeExtensions, (e) => !!e.needsBuild)
      return { ...definition, needsBuild }
    }),
    "name"
  )
}

interface ModuleDefinitionMap {
  [moduleType: string]: { plugin: GardenPlugin; spec: ModuleTypeDefinition }
}

// TODO: deduplicate from action resolution above
function resolveModuleDefinitions(resolvedPlugins: PluginMap, configs: GenericProviderConfig[]): PluginMap {
  // Collect module type declarations
  const graph = new DependencyGraph()
  const moduleDefinitionMap: { [moduleType: string]: { plugin: GardenPlugin; spec: ModuleTypeDefinition }[] } = {}
  const moduleExtensionMap: { [moduleType: string]: { plugin: GardenPlugin; spec: ModuleTypeExtension }[] } = {}

  for (const plugin of Object.values(resolvedPlugins)) {
    for (const spec of plugin.createModuleTypes) {
      pushToKey(moduleDefinitionMap, spec.name, { plugin, spec })

      graph.addNode(spec.name, `${spec.name} (from plugin ${plugin.name})`)

      if (spec.base) {
        graph.addNode(spec.base, `${spec.base} (from plugin ${plugin.name})`)
        graph.addDependency(spec.name, spec.base)
      }
    }

    for (const spec of plugin.extendModuleTypes) {
      pushToKey(moduleExtensionMap, spec.name, { plugin, spec })
    }
  }

  // Make sure only one _configured_ plugin declares each module type
  for (const [moduleType, definitions] of Object.entries(moduleDefinitionMap)) {
    const configured = definitions.filter((d) => configs.map((c) => c.name).includes(d.plugin.name))

    if (configured.length > 1) {
      const plugins = definitions.map((d) => d.plugin.name)

      throw new ConfigurationError(
        `Module type '${moduleType}' is declared in multiple plugins: ${plugins.join(", ")}.`,
        { moduleType, plugins }
      )
    }
  }

  // Make sure we don't have circular dependencies in module type bases
  const cycles = graph.detectCircularDependencies()

  if (cycles.length > 0) {
    const description = graph.cyclesToString(cycles)
    const detail = { "circular-dependencies": description }
    const msg = `Found circular dependency between module type bases:\n\n${description}`
    throw new PluginError(msg, detail)
  }

  const ordered = graph.overallOrder().filter((name) => name in moduleDefinitionMap)

  const resolvedDefinitions: ModuleDefinitionMap = {}

  // Resolve the base for each module declaration (in dependency order)
  const moduleDefinitions = fromPairs(
    ordered.map((name) => {
      const definitions = moduleDefinitionMap[name]

      const resolved = (resolvedDefinitions[name] = resolveModuleDefinition(
        definitions[0].plugin,
        definitions[0].spec,
        resolvedDefinitions,
        resolvedPlugins
      ))

      return [name, resolved]
    })
  )

  // Return the plugins with the resolved module definitions
  return mapValues(resolvedPlugins, (plugin) => {
    // Validate module extensions and add base handlers where appropriate
    const extendModuleTypes = plugin.extendModuleTypes.map((spec) => {
      const moduleType = spec.name
      const definition = moduleDefinitions[moduleType]

      if (!definition) {
        // Ignore if the module type to extend cannot be found.
        return null
      }

      // Attach base handlers (which are the corresponding declaration handlers, if any)
      const handlers = mapValues(spec.handlers, (handler, name) => {
        const baseHandler = definition.spec.handlers[name]

        if (!handler) {
          return handler
        }

        handler = cloneHandler(handler)

        if (handler && baseHandler) {
          handler.base = cloneHandler(baseHandler)
          handler.base!.handlerType = handler.base!.handlerType || name
          handler.base!.pluginName = handler.base!.pluginName || definition.plugin.name
        }

        return handler
      })

      // Need the cast here because for some reason mapValues screws up the typing
      return <ModuleTypeExtension>{
        ...spec,
        handlers,
      }
    })

    return {
      ...plugin,
      createModuleTypes: plugin.createModuleTypes.map((spec) => resolvedDefinitions[spec.name].spec),
      extendModuleTypes: extendModuleTypes.filter(isNotNull),
    }
  })
}

// TODO: deduplicate from action resolution above
function resolveModuleDefinition(
  plugin: GardenPlugin,
  spec: ModuleTypeDefinition,
  definitions: ModuleDefinitionMap,
  resolvedPlugins: PluginMap
) {
  if (!spec.base) {
    // Just attach metadata to handlers and return
    for (const [name, handler] of Object.entries(spec.handlers)) {
      if (!handler) {
        continue
      }
      handler.handlerType = name
      handler.moduleType = spec.name
      handler.pluginName = plugin.name
    }

    return { spec, plugin }
  }

  const baseDefinition = definitions[spec.base]

  if (!baseDefinition) {
    throw new PluginError(
      deline`
      Module type '${spec.name}', defined in plugin '${plugin.name}', specifies base module type '${spec.base}'
      which cannot be found. The plugin is likely missing a dependency declaration.
      Please report an issue with the author.
      `,
      { moduleType: spec.name, baseName: spec.base, pluginName: plugin.name }
    )
  }

  const declaredBy = baseDefinition.plugin.name
  const moduleType = spec.name
  const pluginBases = getPluginBaseNames(plugin.name, resolvedPlugins)

  if (
    declaredBy !== plugin.name &&
    !pluginBases.includes(declaredBy) &&
    !(plugin.dependencies && plugin.dependencies.find((d) => d.name === declaredBy))
  ) {
    throw new PluginError(
      deline`
      Module type '${moduleType}', defined in plugin '${plugin.name}', specifies base module type '${spec.base}'
      which is defined by '${declaredBy}' but '${plugin.name}' does not specify a dependency on that plugin.
      Plugins must explicitly declare dependencies on plugins that define module types they reference.
      Please report an issue with the author.
      `,
      {
        moduleType,
        pluginName: plugin.name,
        declaredByName: declaredBy,
        bases: pluginBases,
      }
    )
  }

  const resolved: ModuleTypeDefinition = {
    // Inherit schema from base, unless overridden
    schema: baseDefinition.spec.schema,
    ...spec,
  }

  const moduleBases = getModuleTypeBases(
    spec,
    mapValues(definitions, (d) => d.spec)
  )

  // Find the nearest base for each configured handler and attach it
  for (const [name, handler] of Object.entries(resolved.handlers)) {
    if (!handler) {
      continue
    }

    for (const base of moduleBases) {
      const baseHandler = base.handlers && base.handlers[name]

      if (baseHandler) {
        handler.base = cloneHandler(baseHandler)
        handler.base!.handlerType = baseHandler!.handlerType || name
        handler.base!.pluginName = baseHandler!.pluginName || definitions[base.name].plugin.name
        break
      }
    }
  }

  return { spec: resolved, plugin }
}

// Note: We clone the handler to avoid possible circular references
// (plugin authors may re-use handlers for various reasons).
function cloneHandler(org: any): any {
  function handler() {
    return org.apply(org, arguments)
  }

  for (const key in org) {
    if (org.hasOwnProperty(key)) {
      handler[key] = org[key]
    }
  }
  return handler
}
