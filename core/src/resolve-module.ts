/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isArray, isString, keyBy, partition, uniq } from "lodash-es"
import { validateWithPath } from "./config/validation.js"
import { isUnresolved, legacyResolveTemplateString } from "./template/templated-strings.js"
import { dirname, posix, relative, resolve } from "path"
import type { Garden } from "./garden.js"
import type { GardenError } from "./exceptions.js"
import {
  CircularDependenciesError,
  ConfigurationError,
  FilesystemError,
  InternalError,
  PluginError,
  toGardenError,
} from "./exceptions.js"
import { dedent, deline } from "./util/string.js"
import type { GardenModule, ModuleConfigMap, ModuleMap, ModuleTypeMap } from "./types/module.js"
import { getModuleTypeBases, moduleFromConfig } from "./types/module.js"
import type { BuildDependencyConfig, ModuleConfig } from "./config/module.js"
import { moduleConfigSchema } from "./config/module.js"
import { Profile, profileAsync } from "./util/profiling.js"
import { getLinkedSources } from "./util/ext-source-util.js"
import type { ActionReference, DeepPrimitiveMap } from "./config/common.js"
import { allowUnknown } from "./config/common.js"
import type { ProviderMap } from "./config/provider.js"
import { DependencyGraph } from "./graph/common.js"
import fsExtra from "fs-extra"
import type { Log } from "./logger/log-entry.js"
import type { ModuleConfigContextParams } from "./config/template-contexts/module.js"
import { ModuleConfigContext } from "./config/template-contexts/module.js"
import { pathToCacheContext } from "./cache.js"
import { prepareBuildDependencies } from "./config/base.js"
import type { ModuleTypeDefinition } from "./plugin/plugin.js"
import { serviceFromConfig } from "./types/service.js"
import { taskFromConfig } from "./types/task.js"
import { testFromConfig } from "./types/test.js"
import type { BuildActionConfig, BuildCopyFrom } from "./actions/build.js"
import { isBuildActionConfig } from "./actions/build.js"
import type { GroupConfig } from "./config/group.js"
import type { ActionConfig, ActionKind, BaseActionConfig } from "./actions/types.js"
import type { ModuleGraph } from "./graph/modules.js"
import type { GraphResults } from "./graph/results.js"
import type { ExecBuildConfig } from "./plugins/exec/build.js"
import { pMemoizeDecorator } from "./lib/p-memoize.js"
import { styles } from "./logger/styles.js"
import { actionReferenceToString } from "./actions/base.js"
import type { DepGraph } from "dependency-graph"
import { minimatch } from "minimatch"
import { getModuleTemplateReferences } from "./config/references.js"
import { type ParsedTemplate, UnresolvedTemplateValue } from "./template/types.js"
import { conditionallyDeepEvaluate, evaluate } from "./template/evaluate.js"
import { someReferences } from "./template/analysis.js"
import { parseTemplateCollection } from "./template/templated-collections.js"
import { deepMap, isPlainObject } from "./util/objects.js"
import { InputContext } from "./config/template-contexts/input.js"
import { VariablesContext } from "./config/template-contexts/variables.js"

const { mkdirp, readFile } = fsExtra

// This limit is fairly arbitrary, but we need to have some cap on concurrent processing.
export const moduleResolutionConcurrencyLimit = 50

/**
 * Resolves a set of module configurations in dependency order.
 *
 * This operates differently than the TaskGraph in that it can add dependency links as it proceeds through the modules,
 * which is important because dependencies can be discovered mid-stream, and the TaskGraph currently needs to
 * statically resolve all dependencies before processing tasks.
 */
@Profile()
export class ModuleResolver {
  private garden: Garden
  private log: Log
  private rawConfigsByKey: ModuleConfigMap
  private resolvedProviders: ProviderMap
  private graphResults?: GraphResults
  private bases: { [type: string]: ModuleTypeDefinition[] }

  constructor({
    garden,
    log,
    rawConfigs,
    resolvedProviders,
    graphResults,
  }: {
    garden: Garden
    log: Log
    rawConfigs: ModuleConfig[]
    resolvedProviders: ProviderMap
    graphResults?: GraphResults
  }) {
    this.garden = garden
    this.log = log
    this.rawConfigsByKey = keyBy(rawConfigs, (c) => c.name)
    this.resolvedProviders = resolvedProviders
    this.graphResults = graphResults
    this.bases = {}
  }

  async resolve({ actionsFilter }: { actionsFilter: string[] | undefined }) {
    // Collect template references for every raw config and work out module references in templates and explicit
    // dependency references. We use two graphs, one will be fully populated as we progress, the other we gradually
    // remove nodes from as we complete the processing.
    const fullGraph = new DependencyGraph<string>()
    const rawConfigs = Object.values(this.rawConfigsByKey)
    const allPaths = new Set<string>()
    for (const rawConfig of rawConfigs) {
      allPaths.add(rawConfig.path)
    }

    this.addModulesToGraph(fullGraph, rawConfigs)

    const processingGraph = fullGraph.clone()

    const minimalRoots = await this.garden.vcs.getMinimalRoots(this.log, allPaths)

    const resolveResults: Record<string, { config: ModuleConfig; context: ModuleConfigContext }> = {}
    const resolvedModules: ModuleMap = {}
    const errors: { [moduleName: string]: GardenError } = {}

    const inFlight = new Set<string>()

    const processNode = async (moduleKey: string, forceResolve: boolean) => {
      if (inFlight.has(moduleKey)) {
        return
      }

      this.log.silly(() => `ModuleResolver: Process node ${moduleKey}`)
      inFlight.add(moduleKey)

      // Resolve configuration, unless previously resolved.
      let resolveResult = resolveResults[moduleKey]
      let foundNewDependency = false

      const dependencyNames = fullGraph.dependenciesOf(moduleKey)
      const resolvedDependencies = dependencyNames.map((n) => resolvedModules[n]).filter(Boolean)

      try {
        if (!resolveResult) {
          const rawConfig = this.rawConfigsByKey[moduleKey]

          this.log.silly(() => `ModuleResolver: Resolve config ${moduleKey}`)
          resolveResult = resolveResults[moduleKey] = await this.resolveModuleConfig(rawConfig, resolvedDependencies)

          // Check if any new build dependencies were added by the configure handler
          for (const dep of resolveResult.config.build.dependencies) {
            const depKey = dep.name

            if (!dependencyNames.includes(depKey)) {
              this.log.silly(() => `ModuleResolver: Found new dependency ${depKey} when resolving ${moduleKey}`)

              // We throw if the build dependency can't be found at all
              if (!fullGraph.hasNode(depKey)) {
                throw missingBuildDependency(rawConfig.name, depKey)
              }
              fullGraph.addDependency(moduleKey, depKey)

              foundNewDependency = true

              // The dependency may already have been processed, we don't want to add it to the graph in that case
              if (processingGraph.hasNode(depKey)) {
                this.log.silly(
                  () => `ModuleResolver: Need to re-resolve ${moduleKey} after processing new dependencies`
                )
                processingGraph.addDependency(moduleKey, depKey)
              }
            }
          }
        }

        // If no unresolved build dependency was added, fully resolve the module and remove from graph, otherwise keep
        // it in the graph and move on to make sure we fully resolve the dependencies and don't run into circular
        // dependencies.
        if (!foundNewDependency) {
          const shouldResolve =
            forceResolve || this.shouldResolveInline({ config: resolveResult.config, actionsFilter, fullGraph })

          if (shouldResolve) {
            const buildPath = this.garden.buildStaging.getBuildPath(resolveResult.config)
            resolvedModules[moduleKey] = await this.resolveModule({
              resolvedConfig: resolveResult.config,
              variables: resolveResult.context.variables,
              buildPath,
              dependencies: resolvedDependencies,
              repoRoot: minimalRoots[resolveResult.config.path],
            })
          } else {
            this.log.debug(() => `ModuleResolver: Module ${moduleKey} skipped`)
          }

          processingGraph.removeNode(moduleKey)
        }
      } catch (err) {
        this.log.silly(() => `ModuleResolver: Node ${moduleKey} failed: ${err}`)
        errors[moduleKey] = toGardenError(err)
      }

      inFlight.delete(moduleKey)
      return processLeaves(forceResolve)
    }

    const processLeaves = async (forceResolve: boolean) => {
      if (Object.keys(errors).length > 0) {
        for (const err of Object.values(errors)) {
          if (err instanceof InternalError) {
            throw err
          }
        }
        const errorStr = Object.entries(errors)
          .map(([name, err]) => `${styles.highlight.bold(name)}: ${err.message}`)
          .join("\n")
        const msg = `Failed resolving one or more modules:\n\n${errorStr}`

        const combined = new ConfigurationError({
          message: msg,
          wrappedErrors: Object.values(errors),
        })
        throw combined
      }

      // Get batch of leaf nodes (ones with no unresolved dependencies). Implicitly checks for circular dependencies.
      let batch: string[]

      try {
        batch = processingGraph.overallOrder(true).filter((n) => !inFlight.has(n))
      } catch (err) {
        if (err instanceof CircularDependenciesError) {
          err.messagePrefix = "Detected circular dependencies between module configurations"
        }

        throw err
      }

      this.log.silly(() => `ModuleResolver: Process ${batch.length} leaves`)

      if (batch.length === 0) {
        return
      }

      const overLimit = inFlight.size + batch.length - moduleResolutionConcurrencyLimit

      if (overLimit > 0) {
        batch = batch.slice(batch.length - overLimit)
      }

      // Process each of the leaf node module configs.
      await Promise.all(batch.map((m) => processNode(m, forceResolve)))
    }

    // Iterate through dependency graph, a batch of leaves at a time. While there are items remaining:
    let i = 0

    while (processingGraph.size() > 0) {
      this.log.silly(() => `ModuleResolver: Loop ${++i}`)
      await processLeaves(false)
    }

    // Need to make sure we resolve modules that contain runtime dependencies of services, tasks and tests specified
    // in actionsFilter (if any), including transitive dependencies.
    const mayNeedAdditionalResolution = (actionsFilter || []).some((f) => {
      // Build dependencies, i.e. module-to-module deps, will already be accounted for above.
      return !f.startsWith("build.")
    })

    let runtimeGraph = new DependencyGraph<string>()

    if (mayNeedAdditionalResolution) {
      runtimeGraph = fullGraph.clone()
      const serviceNames = new Set<string>()
      const taskNames = new Set<string>()

      // Add runtime dependencies to the module dependency graph
      for (const { config } of Object.values(resolveResults)) {
        for (const service of config.serviceConfigs) {
          const key = `deploy.${service.name}`
          runtimeGraph.addNode(key)
          runtimeGraph.addDependency(key, config.name)
          serviceNames.add(service.name)
        }
        for (const task of config.taskConfigs) {
          const key = `run.${task.name}`
          runtimeGraph.addNode(key)
          runtimeGraph.addDependency(key, config.name)
          taskNames.add(task.name)
        }
        for (const test of config.testConfigs) {
          const key = `test.${config.name}-${test.name}`
          runtimeGraph.addNode(key)
          runtimeGraph.addDependency(key, config.name)
        }
      }

      const addRuntimeDep = (key: string, dep: string) => {
        const depType = serviceNames.has(dep) ? "deploy" : taskNames.has(dep) ? "run" : null
        if (depType) {
          const depKey = `${depType}.${dep}`
          runtimeGraph.addNode(depKey)
          runtimeGraph.addDependency(key, depKey)
        }
      }

      for (const { config } of Object.values(resolveResults)) {
        for (const service of config.serviceConfigs) {
          const key = `deploy.${service.name}`
          for (const dep of service.dependencies || []) {
            addRuntimeDep(key, dep)
          }
        }
        for (const task of config.taskConfigs) {
          const key = `run.${task.name}`
          for (const dep of task.dependencies || []) {
            addRuntimeDep(key, dep)
          }
        }
        for (const test of config.testConfigs) {
          const key = `test.${config.name}-${test.name}`
          for (const dep of test.dependencies) {
            addRuntimeDep(key, dep)
          }
        }
      }

      // Collect all modules that still need to be resolved
      const needResolve: { [key: string]: ModuleConfig } = {}

      for (const pattern of actionsFilter || []) {
        const deps = this.dependenciesOfWildcard(runtimeGraph, pattern)
        // Note: Module names in the graph don't have the build. prefix
        const moduleDepNames = deps.filter((d) => !d.includes("."))
        for (const name of moduleDepNames) {
          if (!resolvedModules[name] && resolveResults[name]) {
            needResolve[name] = resolveResults[name].config
          }
        }
      }

      // Populate the processing graph and then resolve the remaining modules
      this.addModulesToGraph(processingGraph, Object.values(needResolve))

      while (processingGraph.size() > 0) {
        this.log.silly(() => `ModuleResolver: Loop ${++i}`)
        await processLeaves(true)
      }
    }

    const skipped = new Set<string>()

    if (actionsFilter && mayNeedAdditionalResolution) {
      for (const { config } of Object.values(resolveResults)) {
        if (!resolvedModules[config.name]) {
          skipped.add(`build.${config.name}`)
          for (const s of config.serviceConfigs) {
            skipped.add(`deploy.${s.name}`)
          }
          for (const t of config.taskConfigs) {
            skipped.add(`run.${t.name}`)
          }
          for (const t of config.testConfigs) {
            skipped.add(`test.${config.name}-${t.name}`)
          }
        }
      }

      const maybeSkip = (key: string) => {
        // Don't skip anything that's requested in the filter
        if (this.matchFilter(key, actionsFilter)) {
          return
        }
        // Flag as skipped if the module is resolved but the action isn't requested, and it is not depended on by
        // anything that is requested.
        for (const f of actionsFilter) {
          if (this.matchFilter(key, this.dependenciesOfWildcard(runtimeGraph, f))) {
            return
          }
        }
        skipped.add(key)
      }

      for (const m of Object.values(resolvedModules)) {
        for (const s of m.serviceConfigs) {
          maybeSkip(`deploy.${s.name}`)
        }
        for (const t of m.taskConfigs) {
          maybeSkip(`run.${t.name}`)
        }
        for (const t of m.testConfigs) {
          maybeSkip(`test.${m.name}-${t.name}`)
        }
      }
    }

    // Clean up after our little hack
    for (const config of Object.values(this.rawConfigsByKey)) {
      delete config["_templateDeps"]
    }

    return { skipped, resolvedModules: Object.values(resolvedModules), resolvedConfigs: Object.values(resolveResults) }
  }

  private addModulesToGraph(graph: DepGraph<string>, configs: ModuleConfig[]) {
    for (const config of configs) {
      graph.addNode(config.name)
    }

    for (const config of configs) {
      const buildPath = this.garden.buildStaging.getBuildPath(config)
      const deps = this.getModuleDependenciesFromConfig(config, buildPath)
      for (const dep of deps) {
        const depKey = dep.name
        graph.addNode(depKey)
        graph.addDependency(config.name, depKey)
      }
    }
  }

  /**
   * Returns true if we know that the module should be resolved during the initial pass in config resolution.
   * This is the case if no filter is set, the module itself is set in the actions filter, or if it's depended on
   * by something set in the filter.
   *
   * After the first pass of config resolution, we do a separate check to see if an entity (service or task) is
   * depended upon in any of the resolved modules in the first pass.
   */
  private shouldResolveInline({
    config,
    actionsFilter,
    fullGraph,
  }: {
    config: ModuleConfig
    actionsFilter: string[] | undefined
    fullGraph: DependencyGraph<string>
  }) {
    if (!actionsFilter) {
      return true
    }

    // Is the module itself set in the filter?
    if (this.moduleMatchesFilter(config, actionsFilter)) {
      return true
    }

    // Is it depended on (at the module level) by something set in the filter or in a template string?
    const dependantKeys = fullGraph.dependantsOf(config.name)
    for (const key of dependantKeys) {
      const dep = this.rawConfigsByKey[key]
      if (!dep) {
        continue
      }
      if (dep["_templateDeps"]?.includes(config.name)) {
        return true
      }
      if (this.moduleMatchesFilter(dep, actionsFilter)) {
        return true
      }
    }

    return false
  }

  private matchFilter(key: string, actionsFilter: string[] | undefined) {
    if (!actionsFilter) {
      return true
    }
    return actionsFilter.some((f: string) => minimatch(key, f))
  }

  private dependenciesOfWildcard(graph: DependencyGraph<string>, pattern: string) {
    const matchedKeys = graph.keys().filter((k) => minimatch(k, pattern))
    return uniq(matchedKeys.flatMap((k) => graph.dependenciesOf(k)))
  }

  private moduleMatchesFilter(config: ModuleConfig, actionsFilter: string[] | undefined) {
    if (!actionsFilter) {
      return true
    }

    const match = (n: string) => actionsFilter.some((f: string) => minimatch(n, f))

    if (match(`build.${config.name}`)) {
      return true
    }

    // Also need to match on the name of the templated module, if applicable
    if (config.parentName && match(`build.${config.parentName}`)) {
      return true
    }

    for (const s of getServiceNames(config)) {
      if (match(`deploy.${s}`)) {
        return true
      }
    }
    for (const t of getTaskNames(config)) {
      if (match(`run.${t}`)) {
        return true
      }
    }
    for (const t of getTestNames(config)) {
      if (match(`test.${config.name}-${t}`)) {
        return true
      }
    }
    return false
  }

  /**
   * Returns module configs for each module that is referenced in a ${modules.*} template string in the raw config,
   * as well as any immediately resolvable declared build dependencies.
   */
  private getModuleDependenciesFromConfig(rawConfig: ModuleConfig, buildPath: string) {
    const contextParams = {
      garden: this.garden,
      variables: this.garden.variables,
      resolvedProviders: this.resolvedProviders,
      name: rawConfig.name,
      path: rawConfig.path,
      buildPath,
      parentName: rawConfig.parentName,
      templateName: rawConfig.templateName,
      inputs: InputContext.forModule(this.garden, rawConfig),
      modules: [],
      graphResults: this.graphResults,
    }

    const configContext = new ModuleConfigContext(contextParams)

    const templateDeps = getModuleTemplateReferences(rawConfig, configContext)

    // This is a bit of a hack, but we need to store the template dependencies on the raw config so we can check
    // them later when deciding whether to resolve a module inline or not.
    rawConfig["_templateDeps"] = templateDeps

    // Try resolving template strings if possible
    const buildDeps: string[] = []
    // @ts-expect-error todo: correct types for unresolved configs
    const { resolved } = evaluate(rawConfig.build.dependencies, {
      context: configContext,
      opts: {},
    })
    // The build.dependencies field may not resolve at all, in which case we can't extract any deps from there
    if (isArray(resolved)) {
      for (const d of resolved) {
        if (isString(d)) {
          buildDeps.push(d)
        } else if (isPlainObject(d) && isString(d.name)) {
          buildDeps.push(d.name)
        }
      }
    }

    const deps = uniq([...templateDeps, ...buildDeps])

    return deps.map((name) => {
      const moduleConfig = this.rawConfigsByKey[name]

      if (!moduleConfig) {
        throw missingBuildDependency(rawConfig.name, name as string)
      }

      return moduleConfig
    })
  }

  @pMemoizeDecorator()
  private async getLinkedSources() {
    return getLinkedSources(this.garden, "module")
  }

  /**
   * Resolves and validates a single module configuration.
   */
  async resolveModuleConfig(
    unresolvedConfig: ModuleConfig,
    dependencies: GardenModule[]
  ): Promise<{ config: ModuleConfig; context: ModuleConfigContext }> {
    const garden = this.garden

    const buildPath = this.garden.buildStaging.getBuildPath(unresolvedConfig)

    const templateContextParams: ModuleConfigContextParams = {
      garden,
      variables: garden.variables,
      resolvedProviders: this.resolvedProviders,
      modules: dependencies,
      name: unresolvedConfig.name,
      path: unresolvedConfig.path,
      buildPath,
      parentName: unresolvedConfig.parentName,
      templateName: unresolvedConfig.templateName,
      inputs: InputContext.forModule(garden, unresolvedConfig),
      graphResults: this.graphResults,
    }

    const contextWithoutVariables = new ModuleConfigContext(templateContextParams)

    const context = new ModuleConfigContext({
      ...templateContextParams,
      variables: await VariablesContext.forModule(this.garden, unresolvedConfig, contextWithoutVariables),
    })

    const moduleTypeDefinitions = await garden.getModuleTypes()
    const description = moduleTypeDefinitions[unresolvedConfig.type]

    if (!description) {
      const configPath = relative(garden.projectRoot, unresolvedConfig.configPath || unresolvedConfig.path)

      throw new ConfigurationError({
        message: dedent`
          Unrecognized module type '${
            unresolvedConfig.type
          }' (defined at ${configPath}). Are you missing a provider configuration?

          Currently available module types: ${Object.keys(moduleTypeDefinitions)}
        `,
      })
    }

    // @ts-expect-error todo: correct types for unresolved configs
    let config: ModuleConfig = partiallyEvaluateModule(unresolvedConfig, context)

    // Validate inputs if those are already resolved
    const templateName = config.templateName
    if (templateName && !isUnresolved(config.inputs)) {
      const template = this.garden.configTemplates[templateName]
      config.inputs = validateWithPath<DeepPrimitiveMap>({
        config: config.inputs,
        configType: `inputs for module ${config.name}`,
        path: config.configPath || config.path,
        schema: template.inputsSchema,
        projectRoot: garden.projectRoot,
        source: undefined,
      })
    }

    // We allow specifying modules by name only as a shorthand:
    //
    // dependencies:
    //   - foo-module
    //   - name: foo-module // same as the above
    //
    // Empty strings and nulls are omitted from the array.
    if (config.build?.dependencies) {
      config.build.dependencies = prepareBuildDependencies(config.build.dependencies).filter((dep) => dep.name)
    }

    // We need to refilter the build dependencies on the spec in case one or more dependency names resolved to null.
    if (config.spec.build?.dependencies) {
      config.spec.build.dependencies = prepareBuildDependencies(config.spec.build.dependencies)
    }

    // Validate the module-type specific spec
    if (description.schema) {
      config = {
        ...config,
        spec: validateWithPath({
          config: config.spec,
          configType: "Module",
          schema: description.schema,
          name: config.name,
          path: config.path,
          projectRoot: garden.projectRoot,
          source: undefined,
        }),
      }
    }

    // Validate the base config schema
    config = validateWithPath({
      config,
      schema: moduleConfigSchema(),
      configType: "Module",
      name: config.name,
      path: config.path,
      projectRoot: garden.projectRoot,
      source: undefined,
    })

    if (config.repositoryUrl) {
      const linkedSources = await this.getLinkedSources()
      config.basePath = config.path
      config.path = await garden.resolveExtSourcePath({
        name: config.name,
        linkedSources,
        repositoryUrl: config.repositoryUrl,
        sourceType: "module",
      })
    }

    const router = await garden.getActionRouter()
    const configureResult = await router.module.configureModule({
      moduleConfig: config,
      log: garden.log,
    })

    config = configureResult.moduleConfig

    // Validate the configure handler output against the module type's bases
    const bases = this.getBases(config.type, moduleTypeDefinitions)

    for (const base of bases) {
      if (base.schema) {
        garden.log.silly(() => `ModuleResolver: Validating '${config.name}' config against '${base.name}' schema`)

        config.spec = <ModuleConfig>validateWithPath({
          config: config.spec,
          schema: base.schema,
          path: garden.projectRoot,
          projectRoot: garden.projectRoot,
          configType: `configuration for module '${config.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: ConfigurationError,
          source: undefined,
        })
      }
    }

    delete config["_templateDeps"]

    return { config, context }
  }

  /**
   * Get the bases for the given module type, with schemas modified to allow any unknown fields.
   */
  private getBases(type: string, definitions: ModuleTypeMap) {
    if (this.bases[type]) {
      return this.bases[type]
    }

    const bases = getModuleTypeBases(definitions[type], definitions)
    this.bases[type] = bases.map((b) => ({ ...b, schema: b.schema ? allowUnknown(b.schema) : undefined }))
    return this.bases[type]
  }

  private async resolveModule({
    resolvedConfig,
    variables,
    buildPath,
    dependencies,
    repoRoot,
  }: {
    resolvedConfig: ModuleConfig
    variables: VariablesContext
    buildPath: string
    dependencies: GardenModule[]
    repoRoot: string
  }) {
    this.log.debug(() => `ModuleResolver: Resolving module ${resolvedConfig.name}`)

    // Write module files
    const configContext = new ModuleConfigContext({
      garden: this.garden,
      resolvedProviders: this.resolvedProviders,
      variables,
      name: resolvedConfig.name,
      path: resolvedConfig.path,
      buildPath,
      parentName: resolvedConfig.parentName,
      templateName: resolvedConfig.templateName,
      inputs: InputContext.forModule(this.garden, resolvedConfig),
      modules: dependencies,
      graphResults: this.graphResults,
    })

    let updatedFiles = false

    await Promise.all(
      (resolvedConfig.generateFiles || []).map(async (fileSpec) => {
        let contents = fileSpec.value || ""

        if (fileSpec.sourcePath) {
          const configDir = resolvedConfig.configPath ? dirname(resolvedConfig.configPath) : resolvedConfig.path
          const sourcePath = resolve(configDir, fileSpec.sourcePath)

          try {
            contents = (await readFile(sourcePath)).toString()
          } catch (err) {
            throw new ConfigurationError({
              message: `Unable to read file at ${sourcePath}, specified under generateFiles in module ${resolvedConfig.name}: ${err}`,
            })
          }
        }

        const resolvedContents = fileSpec.resolveTemplates
          ? legacyResolveTemplateString({
              string: contents,
              context: configContext,
              contextOpts: {},
            })
          : contents

        if (typeof resolvedContents !== "string") {
          throw new InternalError({
            message: `Expected resolvedContents to be typeof string, but got typeof ${resolvedContents}`,
          })
        }

        const targetDir = resolve(resolvedConfig.path, ...posix.dirname(fileSpec.targetPath).split(posix.sep))
        const targetPath = resolve(resolvedConfig.path, ...fileSpec.targetPath.split(posix.sep))

        // Avoid unnecessary write + invalidating caches on the module path if no changes are made
        try {
          const prior = (await readFile(targetPath)).toString()
          if (prior === resolvedContents) {
            // No change, abort
            return
          } else {
            // File is modified, proceed and flag for cache invalidation
            updatedFiles = true
          }
        } catch {
          // File doesn't exist, proceed and flag for cache invalidation
          updatedFiles = true
        }

        try {
          await mkdirp(targetDir)
          // Use VcsHandler.writeFile() to make sure version is re-computed after writing new/updated files
          await this.garden.vcs.writeFile(this.log, targetPath, resolvedContents)
        } catch (error) {
          throw new FilesystemError({
            message: `Unable to write templated file ${fileSpec.targetPath} from ${resolvedConfig.name}: ${error}`,
          })
        }
      })
    )

    // Make sure version is re-computed after writing new/updated files
    if (updatedFiles) {
      const cacheContext = pathToCacheContext(resolvedConfig.path)
      this.garden.treeCache.invalidateUp(this.log, cacheContext)
    }

    const module = await moduleFromConfig({
      garden: this.garden,
      log: this.log,
      config: resolvedConfig,
      buildDependencies: dependencies,
      scanRoot: repoRoot,
    })

    const moduleTypeDefinitions = await this.garden.getModuleTypes()
    const description = moduleTypeDefinitions[module.type]!

    // Validate the module outputs against the outputs schema
    if (description.moduleOutputsSchema) {
      module.outputs = validateWithPath({
        config: module.outputs,
        schema: description.moduleOutputsSchema,
        configType: `outputs for module`,
        name: module.name,
        path: module.configPath || module.path,
        projectRoot: this.garden.projectRoot,
        ErrorClass: PluginError,
        source: undefined,
      })
    }

    // Validate the module outputs against the module type's bases
    const bases = this.getBases(module.type, moduleTypeDefinitions)

    for (const base of bases) {
      if (base.moduleOutputsSchema) {
        this.log.silly(() => `Validating '${module.name}' module outputs against '${base.name}' schema`)

        module.outputs = validateWithPath({
          config: module.outputs,
          schema: base.moduleOutputsSchema.unknown(true),
          path: module.configPath || module.path,
          projectRoot: this.garden.projectRoot,
          configType: `outputs for module '${module.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: PluginError,
          source: undefined,
        })
      }
    }

    this.log.debug(() => `ModuleResolver: Module ${resolvedConfig.name} resolved`)

    return module
  }
}

export interface ConvertModulesResult {
  groups: GroupConfig[]
  actions: BaseActionConfig[]
}

export function findGroupConfig(result: ConvertModulesResult, groupName: string) {
  return result.groups.find((g) => g.name === groupName)
}

export function findActionConfigInGroup(group: GroupConfig, kind: ActionKind, name: string) {
  return group.actions.find((a) => a.kind === kind && a.name === name)
}

export const convertModules = profileAsync(async function convertModules(
  garden: Garden,
  log: Log,
  modules: GardenModule[],
  graph: ModuleGraph
): Promise<ConvertModulesResult> {
  const allServices = keyBy(graph.getServices(), "name")
  const allTasks = keyBy(graph.getTasks(), "name")

  const groups: GroupConfig[] = []
  const actions: BaseActionConfig[] = []

  await Promise.all(
    modules.map(async (module) => {
      const services = module.serviceConfigs.map((c) => serviceFromConfig(graph, module, c))
      const tasks = module.taskConfigs.map((c) => taskFromConfig(module, c))
      const tests = module.testConfigs.map((c) => testFromConfig(module, c, graph))

      const router = await garden.getActionRouter()

      const copyFrom: BuildCopyFrom[] = []

      for (const d of module.build.dependencies) {
        if (d.copy) {
          copyFrom.push(...d.copy.map((c) => ({ build: d.name, sourcePath: c.source, targetPath: c.target })))
        }
      }

      const convertBuildDependency = (d: string | BuildDependencyConfig): ActionReference => {
        if (typeof d === "string") {
          return { kind: "Build", name: d }
        } else {
          return { kind: "Build", name: d.name }
        }
      }

      const convertRuntimeDependencies = (deps: string[]): ActionReference[] => {
        const resolved: ActionReference[] = []

        for (const d of deps || []) {
          if (allServices[d]) {
            resolved.push({ kind: "Deploy", name: d })
          } else if (allTasks[d]) {
            resolved.push({ kind: "Run", name: d })
          }
        }

        return resolved
      }

      let dummyBuild: ExecBuildConfig | undefined = undefined

      if (copyFrom.length > 0) {
        dummyBuild = makeDummyBuild({
          module,
          copyFrom,
          dependencies: module.build.dependencies.map(convertBuildDependency),
        })
      }

      log.debug(`Converting ${module.type} module ${module.name} to actions`)

      const result = await router.module.convert({
        log,
        module,
        services,
        tasks,
        tests,
        dummyBuild,

        baseFields: {
          internal: {
            basePath: module.basePath || module.path,
          },
          copyFrom,
          disabled: module.disabled,
          source: module.repositoryUrl ? { repository: { url: module.repositoryUrl } } : undefined,
        },

        convertBuildDependency,
        convertTestName: (d: string) => {
          return module.name + "-" + d
        },

        convertRuntimeDependencies,
        // Note: We include any build dependencies from the module, since not all conversions generate a non-dummy
        // build action (and we need to make sure build dependencies from the module are processed before the generated
        // Deploy/Test/Run is).
        prepareRuntimeDependencies(deps: string[], build?: BuildActionConfig<string, any>) {
          const buildDeps: ActionReference[] = module.build.dependencies.map(convertBuildDependency)
          const resolved: ActionReference[] = [...buildDeps, ...convertRuntimeDependencies(deps)]
          if (build && !buildDeps.find((d) => d.name === build.name && d.kind === "Build")) {
            // We make sure not to add the same dependency twice here.
            resolved.push({ kind: "Build", name: build.name })
          }
          return resolved
        },
      })

      const totalReturned = (result.actions?.length || 0) + (result.group?.actions.length || 0)

      log.debug(`Rehydrating templates for ${totalReturned} action(s) in ${module.name}...`)
      for (const a of result.actions || []) {
        for (const k in a) {
          a[k] = parseTemplateCollection({ value: a[k], source: { path: [k] } })
        }
      }
      for (const a of result.group?.actions || []) {
        for (const k in a) {
          a[k] = parseTemplateCollection({ value: a[k], source: { path: [k] } })
        }
      }

      log.debug(`Module ${module.name} converted to ${totalReturned} action(s)`)

      if (result.group) {
        for (const action of result.group.actions) {
          action.internal.groupName = result.group.name
          inheritModuleToAction(module, action)
        }

        if (!result.group.internal) {
          result.group.internal = {}
        }
        result.group.internal.configFilePath = module.configPath

        groups.push(result.group)
      }

      if (result.actions) {
        for (const action of result.actions) {
          inheritModuleToAction(module, action)
        }

        actions.push(...result.actions)
      }
    })
  )

  const allActions = [...actions, ...groups.flatMap((g) => g.actions)]
  // Not all conversion handlers return a Build action for the module, so we need to check for references to
  // build steps for modules that aren't represented by a Build in the post-conversion set of actions.
  // We warn the user to remove the dangling references, but don't throw an exception and instead simply remove
  // the dependencies from the relevant actions.
  const convertedBuildNames = new Set(allActions.filter((a) => isBuildActionConfig(a)).map((a) => a.name))
  const missingBuildNames = new Set(
    graph
      .getModules()
      .map((m) => m.name)
      .filter((name) => !convertedBuildNames.has(name))
  )

  const isMissingBuildDependency = (d: ActionReference<ActionKind>) =>
    d.kind === "Build" && missingBuildNames.has(d.name)

  for (const action of allActions) {
    const [missingBuilds, existingBuilds] = partition(action.dependencies || [], isMissingBuildDependency)
    action.dependencies = existingBuilds

    const moduleName = action.internal.moduleName
    if (!moduleName) {
      continue
    }

    for (const missingBuild of missingBuilds) {
      const depName = missingBuild.name
      const depType = graph.getModule(depName)?.type
      if (!depType) {
        continue
      }

      log.warn(
        deline`
          Action ${styles.highlight(actionReferenceToString(action))} depends on
          ${styles.highlight("build." + depName)} (from module ${styles.highlight(depName)} of type ${depType}),
          which doesn't exist. This is probably because there's no need for a Build action when converting modules
          of type ${depType} to actions. Skipping this dependency.
        `
      )
      log.warn(
        deline`
          Please remove the build dependency on ${styles.highlight(depName)} from the module
          ${styles.highlight(moduleName)}'s configuration.
        `
      )
    }
  }

  return { groups, actions }
})

export function makeDummyBuild({
  module,
  copyFrom,
  dependencies,
}: {
  module: GardenModule
  // To make it clear at the call site that we're not inferring `copyFrom` or `dependencies` from `module`, we  ask the
  // caller to explicitly provide `undefined` instead of making the param optional.
  copyFrom: BuildCopyFrom[] | undefined
  dependencies: ActionReference[] | undefined
}): ExecBuildConfig {
  return {
    kind: "Build",
    type: "exec",
    name: module.name,

    internal: {
      basePath: module.path,
    },

    copyFrom,
    source: module.repositoryUrl ? { repository: { url: module.repositoryUrl } } : undefined,
    buildAtSource: module.local,

    allowPublish: module.allowPublish,
    dependencies,

    timeout: module.build.timeout,
    spec: {
      command: [],
      env: {},
    },
  }
}

function inheritModuleToAction(module: GardenModule, action: ActionConfig) {
  if (!action.internal.basePath) {
    action.internal.basePath = module.basePath || module.path
  }

  // Enforce some inheritance from module
  action.internal.moduleName = module.name
  action.internal.moduleVersion = module.version
  if (module.disabled) {
    action.disabled = true
  }
  action.internal.basePath = module.path
  if (isBuildActionConfig(action)) {
    action.buildAtSource = module.local
  }
  if (module.configPath) {
    action.internal.configFilePath = module.configPath
  }
  if (module.templateName) {
    action.internal.templateName = module.templateName
  }
  if (module.parentName) {
    action.internal.parentName = module.parentName
  }
  if (module.inputs) {
    action.internal.inputs = module.inputs
  }
  if (module.repositoryUrl) {
    action.internal.remoteClonePath = module.path // This is set to the source local path during module resolution
  }
  if (isBuildActionConfig(action)) {
    if (!module.allowPublish) {
      action.allowPublish = false
    }
    action.internal.treeVersion = module.version
  }
  if (!action.varfiles && module.varfile) {
    action.varfiles = [module.varfile]
  }
  if (!action.variables) {
    action.variables = module.variables
  }

  // Need to remove this since we set it in the baseFields object passed to the convert handler
  if (action.kind !== "Build") {
    delete action["copyFrom"]
  }
}

function missingBuildDependency(moduleName: string, dependencyName: string) {
  return new ConfigurationError({
    message:
      `Could not find build dependency ${styles.highlight(dependencyName)}, ` +
      `configured in module ${styles.highlight(moduleName)}`,
  })
}

// We're hardcoding the module types here because the schemas are frozen, so it's an okay shortcut to support
// partial resolution.
function getServiceNames(config: ModuleConfig) {
  const names = config.serviceConfigs.map((s) => s.name)
  // These all have a services list field
  if (["container", "jib-container", "exec"].includes(config.type)) {
    names.push(...(config.spec.services || []).map((s) => s.name).filter(Boolean))
  }
  // These all map to a single service
  if (["helm", "kubernetes", "terraform", "pulumi"].includes(config.type)) {
    names.push(config.name)
  }
  return names
}

function getTaskNames(config: ModuleConfig) {
  const names = config.taskConfigs.map((t) => t.name)
  // These all have a tasks list field
  if (["exec", "kubernetes", "helm", "container", "jib-container"].includes(config.type)) {
    names.push(...(config.spec.tasks || []).map((t) => t.name).filter(Boolean))
  }
  return names
}

function getTestNames(config: ModuleConfig) {
  const names = config.testConfigs.map((t) => t.name)
  // These all have a tests list field
  if (["exec", "kubernetes", "helm", "container", "jib-container"].includes(config.type)) {
    names.push(...(config.spec.tests || []).map((t) => config.name + "-" + t.name).filter(Boolean))
  }
  return names
}

/**
 * The module resolution flow is special:
 *
 * 1. We will fully resolve all values that do not contain runtime references (with `unescape: false`).
 * 2. We'll call `toJSON` on all `UnresolvedTemplateValue` instances. This will convert template expressions to raw template strings.
 * 3. Then we'll apply the module schemas and call configure handlers with the partially resolved config. We know that unresolved values can cause validation errors here.
 * 4. Once the config has been converted to actions, we call `parseTemplateCollection` again.
 *
 * This has a number of horrible consequences, e.g. we parse template strings in environment variables and you can't use runtime outputs on template values where the schema expects a number.
 *
 * If there was a way to avoid all that, that would definitely be preferred.
 *
 * Let's hope that the deprecated module code can be removed at some point.
 *
 * This function can be deleted together with `conditionallyDeepEvaluate` and the `unescape` option at that point.
 */
function partiallyEvaluateModule<Input extends ParsedTemplate>(config: Input, context: ModuleConfigContext) {
  /**
   * Returns false if the unresolved template value contains runtime references, in order to skip resolving it at this point.
   */
  const skipRuntimeAndSecretsReferences = (value: UnresolvedTemplateValue) => {
    if (
      someReferences({
        value,
        context,
        opts: {},
        onlyEssential: true,
        matcher: (ref) => ref.keyPath[0] === "runtime" || ref.keyPath[0] === "secrets",
      })
    ) {
      return false // do not evaluate runtime and secrets references
    }

    return true
  }

  const partial = conditionallyDeepEvaluate(
    config,
    {
      context,
      opts: {
        // Modules will be converted to actions later, and escape characters will be properly removed then.
        // We need this as we intend to parse the evaluation result later again.
        keepEscapingInTemplateStrings: true,
      },
    },
    skipRuntimeAndSecretsReferences
  )

  // any leftover unresolved template values are now turned back into the raw form
  // this was necessary because we apply module schemas on the partially resolved config
  return deepMap(partial, (v) => {
    if (v instanceof UnresolvedTemplateValue) {
      return v.toJSON()
    }
    return v
  })
}
