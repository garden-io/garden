/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
  ModuleTypeMap,
  RegisterPluginParam,
  pluginModuleSchema,
} from "./types/plugin/plugin"
import { GenericProviderConfig } from "./config/provider"
import { ConfigurationError, PluginError, RuntimeError } from "./exceptions"
import { uniq, mapValues, fromPairs, flatten, keyBy, some, isString, isFunction } from "lodash"
import { findByName, pushToKey, getNames } from "./util/util"
import { deline } from "./util/string"
import { validateSchema } from "./config/validation"
import { LogEntry } from "./logger/log-entry"
import { DependencyValidationGraph } from "./util/validate-dependencies"
import { parse, resolve } from "path"
import Bluebird from "bluebird"

export async function loadPlugins(
  log: LogEntry,
  projectRoot: string,
  registeredPlugins: RegisterPluginParam[],
  configs: GenericProviderConfig[]
) {
  const initializedPlugins: PluginMap = {}
  const loadedPlugins = keyBy(await Bluebird.map(registeredPlugins, (p) => loadPlugin(log, projectRoot, p)), "name")

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
      const depPlugin = validatePlugin(dep)

      if (!depPlugin) {
        throw new PluginError(
          `Plugin '${plugin.name}' lists plugin '${dep}' as a dependency, but that plugin has not been registered.`,
          { loadedPlugins: Object.keys(loadedPlugins), dependency: dep }
        )
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
  const resolvedPlugins = mapValues(initializedPlugins, (p) => resolvePlugin(p, initializedPlugins, configs))

  // Resolve module type definitions
  return Object.values(resolveModuleDefinitions(resolvedPlugins, configs))
}

async function loadPlugin(log: LogEntry, projectRoot: string, nameOrPlugin: RegisterPluginParam) {
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
      pluginModule = validateSchema(pluginModule, pluginModuleSchema(), {
        context: `plugin module "${moduleNameOrLocation}"`,
      })
    } catch (err) {
      throw new PluginError(`Unable to load plugin: ${err}`, {
        moduleNameOrLocation,
        err,
      })
    }

    plugin = pluginModule.gardenPlugin
  } else if (isFunction(nameOrPlugin)) {
    plugin = nameOrPlugin()
  } else {
    plugin = nameOrPlugin
  }

  log.silly(`Loaded plugin ${plugin.name}`)

  return plugin
}

/**
 * Returns the given provider plugins in dependency order.
 */
export function getDependencyOrder(loadedPlugins: PluginMap): string[] {
  const graph = new DependencyValidationGraph()

  for (const plugin of Object.values(loadedPlugins)) {
    graph.addNode(plugin.name)

    if (plugin.base) {
      graph.addNode(plugin.base)
      graph.addDependency(plugin.name, plugin.base)
    }

    for (const dependency of plugin.dependencies || []) {
      graph.addNode(dependency)
      graph.addDependency(plugin.name, dependency)
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

  // Merge dependencies with base
  resolved.dependencies = uniq([...(plugin.dependencies || []), ...(base.dependencies || [])]).sort()

  // Merge plugin handlers
  resolved.handlers = { ...(plugin.handlers || {}) }

  for (const [name, handler] of Object.entries(base.handlers || {})) {
    if (!handler) {
      continue
    } else if (resolved.handlers[name]) {
      // Attach the overridden handler as a base, and attach metadata
      resolved.handlers[name].base = Object.assign(handler, { actionType: name, pluginName: base.name })
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

  // If the base is not expressly configured for the environment, we pull and coalesce its module declarations.
  // We also make sure the plugin doesn't redeclare a module type from the base.
  resolved.createModuleTypes = [...plugin.createModuleTypes]
  resolved.extendModuleTypes = [...plugin.extendModuleTypes]

  for (const spec of base.createModuleTypes) {
    if (findByName(plugin.createModuleTypes, spec.name)) {
      throw new PluginError(
        `Plugin '${plugin.name}' redeclares the '${spec.name}' module type, already declared by its base.`,
        { plugin, base }
      )
    } else if (!baseIsConfigured) {
      resolved.createModuleTypes.push(spec)
    }
  }

  if (!baseIsConfigured) {
    // Base is not explicitly configured, so we coalesce the module type extensions
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
 * Recursively resolves all the bases for the given module type, ordered from closest base to last.
 */
export function getModuleTypeBases(
  moduleType: ModuleTypeDefinition,
  moduleTypes: { [name: string]: ModuleTypeDefinition }
): ModuleTypeDefinition[] {
  if (!moduleType.base) {
    return []
  }

  const base = moduleTypes[moduleType.base]

  if (!base) {
    throw new RuntimeError(`Unable to find base module type '${moduleType.base}' for module type '${name}'`, {
      name,
      moduleTypes,
    })
  }

  return [base, ...getModuleTypeBases(base, moduleTypes)]
}

/**
 * Recursively get all declared dependencies for the given plugin,
 * i.e. direct dependencies, and dependencies of those dependencies etc.
 */
export function getPluginDependencies(plugin: GardenPlugin, loadedPlugins: PluginMap): GardenPlugin[] {
  return uniq(
    flatten(
      (plugin.dependencies || []).map((depName) => {
        const depPlugin = loadedPlugins[depName]
        if (!depPlugin) {
          throw new RuntimeError(`Unable to find dependency '${depName} for plugin '${plugin.name}'`, { plugin })
        }
        return [depPlugin, ...getPluginDependencies(depPlugin, loadedPlugins)]
      })
    )
  )
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
      const needsBuild = !!definition.handlers.build || some(typeExtensions, (e) => !!e.handlers.build)
      return { ...definition, needsBuild }
    }),
    "name"
  )
}

interface ModuleDefinitionMap {
  [moduleType: string]: { plugin: GardenPlugin; spec: ModuleTypeDefinition }
}

function resolveModuleDefinitions(resolvedPlugins: PluginMap, configs: GenericProviderConfig[]): PluginMap {
  // Collect module type declarations
  const graph = new DependencyValidationGraph()
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

      // Make sure plugins that extend module types correctly declare their dependencies
      if (!definition) {
        throw new PluginError(
          deline`
          Plugin '${plugin.name}' extends module type '${moduleType}' but the module type has not been declared.
          The '${plugin.name}' plugin is likely missing a dependency declaration.
          Please report an issue with the author.
          `,
          { moduleType, pluginName: plugin.name }
        )
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
          handler.base!.actionType = handler.base!.actionType || name
          handler.base!.moduleType = handler.base!.moduleType || moduleType
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
      extendModuleTypes,
    }
  })
}

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
      handler.actionType = name
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
    !(plugin.dependencies && plugin.dependencies.includes(declaredBy))
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
        handler.base!.actionType = baseHandler!.actionType || name
        handler.base!.moduleType = baseHandler!.moduleType || base.name
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
