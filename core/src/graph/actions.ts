/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import dedent from "dedent"
import { cloneDeep, isArray, isString, keyBy, mapValues, memoize, merge, omit, pick } from "lodash"
import { relative } from "path"
import { actionReferenceToString, ActionWrapperParams, BaseAction, BaseActionConfig, RuntimeAction } from "../actions/base"
import { BuildAction, buildActionConfig } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { prepareBuildDependencies, loadVarfile } from "../config/base"
import { allowUnknown, DeepPrimitiveMap } from "../config/common"
import { GroupConfig } from "../config/group"
import { moduleConfigSchema } from "../config/module"
import { ProviderMap } from "../config/provider"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { GenericContext } from "../config/template-contexts/base"
import { ProjectConfigContext } from "../config/template-contexts/project"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, InternalError, PluginError } from "../exceptions"
import type { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { ModuleTypeDefinition } from "../plugin/module-types"
import { getModuleTypeBases } from "../plugins"
import { moduleResolutionConcurrencyLimit } from "../resolve-module"
import { RuntimeContext } from "../runtime-context"
import {
  getModuleTemplateReferences,
  resolveTemplateStrings,
  mayContainTemplateString,
  resolveTemplateString,
} from "../template-string/template-string"
import { ModuleMap, ModuleTypeMap, moduleFromConfig } from "../types/module"
import { getLinkedSources } from "../util/ext-source-util"
import { Profile } from "../util/profiling"
import { deline } from "../util/string"
import { jsonMerge } from "../util/util"
import { DependencyGraph } from "./common"
import { ConfigGraph } from "./config-graph"

export async function actionConfigsToGraph({
  garden,
  log,
  groupConfigs,
  configs,
}: {
  garden: Garden
  log: LogEntry
  groupConfigs: GroupConfig[]
  configs: BaseActionConfig[]
}): Promise<ConfigGraph> {
  const fromGroups = groupConfigs.flatMap((group) => {
    return group.actions.map((a) => ({ ...a, group }))
  })

  const allConfigs = [...fromGroups, ...configs]
  const byKey = keyBy(allConfigs, (a) => actionReferenceToString(a))

  // Fully resolve built-in fields that only support ProjectConfigContext
  const projectContextKeys = getActionConfigContextKeys()
  const builtinFieldContext = new ActionConfigContext(garden, garden.variables)

  for (const [key, config] of Object.entries(byKey)) {
    // TODO-G2: better error messages when something goes wrong here
    const resolved = resolveTemplateStrings(pick(config, projectContextKeys), builtinFieldContext, {
      allowPartial: false,
    })
    byKey[key] = { ...config, ...resolved }
  }

  // Validate fully resolved keys (the above + those that don't allow any templating)

  // Partially resolve other fields
  for (const [key, config] of Object.entries(byKey)) {
    // TODO-G2: better error messages when something goes wrong here
    const resolved = resolveTemplateStrings(omit(config, projectContextKeys), builtinFieldContext, {
      allowPartial: true,
    })
    byKey[key] = { ...config, ...resolved }
  }

  // Load varfiles
  const varfileVars = await Bluebird.props(
    mapValues(byKey, async (config) => {
      const varsByFile = await Bluebird.map(config.varfiles || [], (path) => {
        return loadVarfile({
          configRoot: config.basePath,
          path,
          defaultPath: undefined,
        })
      })

      const output: DeepPrimitiveMap = {}

      // Merge different varfiles, later files taking precedence over prior files in the list.
      for (const vars of varsByFile) {
        jsonMerge(output, vars)
      }

      return output
    })
  )

  // Resolve tree versions
  // TODO-G2: Maybe we could optimize this, avoid parallel scanning of the same directory/context etc.
  const treeVersions = await Bluebird.props(
    mapValues(byKey, async (config) => {
      return garden.vcs.getTreeVersion(log, garden.projectName, config)
    })
  )

  // Call configure handlers

  // Extract implicit dependencies from template references
}

// This limit is fairly arbitrary, but we need to have some cap on concurrent processing.
const resolutionConcurrencyLimit = 50

/**
 * Resolves a set of module configurations in dependency order.
 *
 * This operates differently than the TaskGraph in that it can add dependency links as it proceeds through the modules,
 * which is important because dependencies can be discovered mid-stream, and the TaskGraph currently needs to
 * statically resolve all dependencies before processing tasks.
 */
@Profile()
class ActionConfigResolver {
  private garden: Garden
  private log: LogEntry
  private rawConfigsByKey: BaseActionConfigMap
  private resolvedProviders: ProviderMap
  private runtimeContext?: RuntimeContext
  private bases: { [type: string]: ModuleTypeDefinition[] }

  constructor({
    garden,
    log,
    rawConfigs,
    resolvedProviders,
    runtimeContext,
  }: {
    garden: Garden
    log: LogEntry
    rawConfigs: BaseActionConfig[]
    resolvedProviders: ProviderMap
    runtimeContext?: RuntimeContext
  }) {
    this.garden = garden
    this.log = log
    this.rawConfigsByKey = keyBy(rawConfigs, (c) => c.name)
    this.resolvedProviders = resolvedProviders
    this.runtimeContext = runtimeContext
    this.bases = {}
  }

  async resolveAll() {
    // Collect template references for every raw config and work out module references in templates and explicit
    // dependency references. We use two graphs, one will be fully populated as we progress, the other we gradually
    // remove nodes from as we complete the processing.
    const fullGraph = new DependencyGraph()
    const processingGraph = new DependencyGraph()

    for (const key of Object.keys(this.rawConfigsByKey)) {
      for (const graph of [fullGraph, processingGraph]) {
        graph.addNode(key)
      }
    }
    for (const [key, rawConfig] of Object.entries(this.rawConfigsByKey)) {
      const buildPath = this.garden.buildStaging.getBuildPath(rawConfig)
      const deps = this.getDependenciesFromConfig(rawConfig, buildPath)
      for (const graph of [fullGraph, processingGraph]) {
        for (const dep of deps) {
          const depKey = dep.name
          graph.addNode(depKey)
          graph.addDependency(key, depKey)
        }
      }
    }

    const resolvedConfigs: BaseActionConfigMap = {}
    const resolvedModules: ModuleMap = {}
    const errors: { [moduleName: string]: Error } = {}

    const inFlight = new Set<string>()

    const processNode = async (moduleKey: string) => {
      if (inFlight.has(moduleKey)) {
        return
      }

      this.log.silly(`ActionConfigResolver: Process node ${moduleKey}`)
      inFlight.add(moduleKey)

      // Resolve configuration, unless previously resolved.
      let resolvedConfig = resolvedConfigs[moduleKey]
      let foundNewDependency = false

      const dependencyNames = fullGraph.dependenciesOf(moduleKey)
      const resolvedDependencies = dependencyNames.map((n) => resolvedModules[n])

      try {
        if (!resolvedConfig) {
          const rawConfig = this.rawConfigsByKey[moduleKey]

          this.log.silly(`ActionConfigResolver: Resolve config ${moduleKey}`)
          resolvedConfig = resolvedConfigs[moduleKey] = await this.resolveConfig(rawConfig, resolvedDependencies)

          // Check if any new dependencies were added by the configure handler
          for (const dep of resolvedConfig.dependencies) {
            const depKey = dep.name

            if (!dependencyNames.includes(depKey)) {
              this.log.silly(`ActionConfigResolver: Found new dependency ${depKey} when resolving ${moduleKey}`)

              // We throw if the build dependency can't be found at all
              if (!fullGraph.hasNode(depKey)) {
                throw missingDependency(rawConfig.name, depKey)
              }
              fullGraph.addDependency(moduleKey, depKey)

              foundNewDependency = true

              // The dependency may already have been processed, we don't want to add it to the graph in that case
              if (processingGraph.hasNode(depKey)) {
                this.log.silly(
                  `ActionConfigResolver: Need to re-resolve ${moduleKey} after processing new dependencies`
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
          resolvedModules[moduleKey] = this.resolve({ resolvedConfig, dependencies: resolvedDependencies })
          this.log.silly(`ActionConfigResolver: Module ${moduleKey} resolved`)
          processingGraph.removeNode(moduleKey)
        }
      } catch (err) {
        this.log.silly(`ActionConfigResolver: Node ${moduleKey} failed: ${err.message}`)
        errors[moduleKey] = err
      }

      inFlight.delete(moduleKey)
      return processLeaves()
    }

    const processLeaves = async () => {
      if (Object.keys(errors).length > 0) {
        const errorStr = Object.entries(errors)
          .map(([name, err]) => `${chalk.white.bold(name)}: ${err.message}`)
          .join("\n")
        const errorStack = Object.entries(errors)
          .map(([name, err]) => `${chalk.white.bold(name)}: ${err.stack || err.message}`)
          .join("\n\n")

        const msg = `Failed resolving one or more modules:\n\n${errorStr}`

        const combined = new ConfigurationError(chalk.red(msg), { ...errors })
        combined.stack = errorStack
        throw combined
      }

      // Get batch of leaf nodes (ones with no unresolved dependencies). Implicitly checks for circular dependencies.
      let batch: string[]

      try {
        batch = processingGraph.overallOrder(true).filter((n) => !inFlight.has(n))
      } catch (err) {
        throw new ConfigurationError(
          dedent`
            Detected circular dependencies between module configurations:

            ${err.detail?.["circular-dependencies"] || err.message}
          `,
          { cycles: err.detail?.cycles }
        )
      }

      this.log.silly(`ActionConfigResolver: Process ${batch.length} leaves`)

      if (batch.length === 0) {
        return
      }

      const overLimit = inFlight.size + batch.length - moduleResolutionConcurrencyLimit

      if (overLimit > 0) {
        batch = batch.slice(batch.length - overLimit)
      }

      // Process each of the leaf node module configs.
      await Bluebird.map(batch, processNode)
    }

    // Iterate through dependency graph, a batch of leaves at a time. While there are items remaining:
    let i = 0

    while (processingGraph.size() > 0) {
      this.log.silly(`ActionConfigResolver: Loop ${++i}`)
      await processLeaves()
    }

    return Object.values(resolvedModules)
  }

  /**
   * Returns module configs for each module that is referenced in a ${modules.*} template string in the raw config,
   * as well as any immediately resolvable declared build dependencies.
   */
  private getDependenciesFromConfig(rawConfig: BaseActionConfig, buildPath: string) {
    const configContext = new ActionConfigContext({
      garden: this.garden,
      variables: this.garden.variables,
      resolvedProviders: this.resolvedProviders,
      name: rawConfig.name,
      path: rawConfig.path,
      buildPath,
      parentName: rawConfig.parentName,
      templateName: rawConfig.templateName,
      inputs: rawConfig.inputs,
      modules: [],
      runtimeContext: this.runtimeContext,
      partialRuntimeResolution: true,
    })

    const templateRefs = getModuleTemplateReferences(rawConfig, configContext)
    const templateDeps = <string[]>templateRefs.filter((d) => d[1] !== rawConfig.name).map((d) => d[1])

    // Try resolving template strings if possible
    let buildDeps: string[] = []
    const resolvedDeps = resolveTemplateStrings(rawConfig.build.dependencies, configContext, { allowPartial: true })

    // The build.dependencies field may not resolve at all, in which case we can't extract any deps from there
    if (isArray(resolvedDeps)) {
      buildDeps = resolvedDeps
        // We only collect fully-resolved references here
        .filter((d) => !mayContainTemplateString(d) && (isString(d) || d.name))
        .map((d) => (isString(d) ? d : d.name))
    }

    const deps = [...templateDeps, ...buildDeps]

    return deps.map((name) => {
      const moduleConfig = this.rawConfigsByKey[name]

      if (!moduleConfig) {
        throw missingBuildDependency(rawConfig.name, name as string)
      }

      return moduleConfig
    })
  }

  /**
   * Resolves and validates a single module configuration.
   */
  resolveConfig(config: BaseActionConfig, dependencies: BaseAction[]): Promise<BaseAction> {
    const garden = this.garden
    let inputs = {}

    const buildPath = this.garden.buildStaging.getBuildPath(config)

    const templateContextParams: BaseActionConfigContextParams = {
      garden,
      variables: garden.variables,
      resolvedProviders: this.resolvedProviders,
      modules: dependencies,
      name: config.name,
      path: config.path,
      buildPath,
      parentName: config.parentName,
      templateName: config.templateName,
      inputs: config.inputs,
      runtimeContext: this.runtimeContext,
      partialRuntimeResolution: true,
    }

    // TODO-G2: GroupTemplate
    // Resolve and validate the inputs field, because template module inputs may not be fully resolved at this
    // time.
    // const templateName = config.templateName

    // if (templateName) {
    //   const template = this.garden.moduleTemplates[templateName]

    //   inputs = resolveTemplateStrings(
    //     inputs,
    //     new BaseActionConfigContext(templateContextParams),
    //     // Not all inputs may need to be resolvable
    //     { allowPartial: true }
    //   )

    //   inputs = validateWithPath({
    //     config: cloneDeep(config.inputs || {}),
    //     configType: `inputs for module ${config.name}`,
    //     path: config.configPath || config.path,
    //     schema: template.inputsSchema,
    //     projectRoot: garden.projectRoot,
    //   })

    //   config.inputs = inputs
    // }

    // Resolve the variables field before resolving everything else (overriding with module varfiles if present)
    const resolvedModuleVariables = this.resolveVariables(config, templateContextParams)

    // Now resolve just references to inputs on the config
    config = resolveTemplateStrings(cloneDeep(config), new GenericContext({ inputs }), {
      allowPartial: true,
    })

    // And finally fully resolve the config
    const configContext = new BaseActionConfigContext({
      ...templateContextParams,
      variables: { ...garden.variables, ...resolvedModuleVariables },
    })

    config = resolveTemplateStrings({ ...config, inputs: {}, variables: {} }, configContext, {
      allowPartial: false,
    })

    config.variables = resolvedModuleVariables
    // config.inputs = inputs

    const moduleTypeDefinitions = await garden.getModuleTypes()
    const description = moduleTypeDefinitions[config.type]

    if (!description) {
      const configPath = relative(garden.projectRoot, config.configPath || config.path)

      throw new ConfigurationError(
        deline`
        Unrecognized action type '${config.type}' (defined at ${configPath}).
        Are you missing a provider configuration?
        `,
        { config, configuredModuleTypes: Object.keys(moduleTypeDefinitions) }
      )
    }

    // We allow specifying modules by name only as a shorthand:
    //
    // dependencies:
    //   - foo-module
    //   - name: foo-module // same as the above
    //
    // Empty strings and nulls are omitted from the array.
    if (config.build && config.build.dependencies) {
      config.build.dependencies = prepareBuildDependencies(config.build.dependencies).filter((dep) => dep.name)
    }

    // We need to refilter the build dependencies on the spec in case one or more dependency names resolved to null.
    if (config.spec.build && config.spec.build.dependencies) {
      config.spec.build.dependencies = prepareBuildDependencies(config.spec.build.dependencies)
    }

    // Validate the module-type specific spec
    if (description.schema) {
      config.spec = validateWithPath({
        config: config.spec,
        configType: "Module",
        schema: description.schema,
        name: config.name,
        path: config.path,
        projectRoot: garden.projectRoot,
      })
    }

    // Validate the base config schema
    config = validateWithPath({
      config,
      schema: moduleConfigSchema(),
      configType: "module",
      name: config.name,
      path: config.path,
      projectRoot: garden.projectRoot,
    })

    if (config.repositoryUrl) {
      const linkedSources = await getLinkedSources(garden, "module")
      config.path = await garden.loadExtSourcePath({
        name: config.name,
        linkedSources,
        repositoryUrl: config.repositoryUrl,
        sourceType: "module",
      })
    }

    const actions = await garden.getActionRouter()
    const configureResult = await actions.module.configureModule({
      moduleConfig: config,
      log: garden.log,
    })

    config = configureResult.moduleConfig

    // Validate the configure handler output against the module type's bases
    const bases = this.getBases(config.type, moduleTypeDefinitions)

    for (const base of bases) {
      if (base.schema) {
        garden.log.silly(`Validating '${config.name}' config against '${base.name}' schema`)

        config.spec = <BaseActionConfig>validateWithPath({
          config: config.spec,
          schema: base.schema,
          path: garden.projectRoot,
          projectRoot: garden.projectRoot,
          configType: `configuration for module '${config.name}' (base schema from '${base.name}' plugin)`,
          ErrorClass: ConfigurationError,
        })
      }
    }

    return config
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

  private resolve({ resolvedConfig, buildPath, dependencies, graph }: { resolvedConfig: BaseActionConfig; buildPath: string; dependencies: BaseAction[]; graph: ConfigGraph }) {
    this.log.silly(`Resolving module ${resolvedConfig.name}`)

    const key = actionReferenceToString(resolvedConfig)

    const params: ActionWrapperParams<any> = {
      baseBuildDirectory: this.garden.buildStaging.buildDirPath,
      config: resolvedConfig,
      dependencies: this.dependencies[key],
      graph,
      projectRoot: this.garden.projectRoot,
      treeVersion: this.treeVersions[key],
    }

    if (resolvedConfig.kind === "Build") {
      return new BuildAction(params)
    } else if (resolvedConfig.kind === "Deploy") {
      return new DeployAction(params)
    } else if (resolvedConfig.kind === "Run") {
      return new RunAction(params)
    } else if (resolvedConfig.kind === "Test") {
      return new TestAction(params)
    } else {
      // This will be caught earlier
      throw new InternalError(`Invalid kind '${resolvedConfig.kind}' encountered when resolving actions.`, { resolvedConfig })
    }
  }

  /**
   * Resolves module variables with the following precedence order:
   *
   *   garden.cliVariables > module varfile > config.variables
   */
  private resolveVariables(
    config: BaseActionConfig,
    templateContextParams: BaseActionConfigContextParams
  ) {
    const moduleConfigContext = new BaseActionConfigContext(templateContextParams)
    const resolveOpts = { allowPartial: false }
    let varfileVars: DeepPrimitiveMap = {}
    if (config.varfile) {
      const varfilePath = resolveTemplateString(config.varfile, moduleConfigContext, resolveOpts)
      varfileVars = await loadVarfile({
        configRoot: config.path,
        path: varfilePath,
        defaultPath: undefined,
      })
    }

    const rawVariables = config.variables
    const moduleVariables = resolveTemplateStrings(cloneDeep(rawVariables || {}), moduleConfigContext, resolveOpts)
    const mergedVariables: DeepPrimitiveMap = <any>merge(moduleVariables, merge(varfileVars, this.garden.cliVariables))
    return mergedVariables
  }
}

const getActionConfigContextKeys = memoize(() => {
  const schema = buildActionConfig()
  const configKeys = schema.describe().keys
  return Object.entries(configKeys)
    .map(([k, v]) => ((<any>v).meta.templateContext === ProjectConfigContext ? k : null))
    .filter(isString)
})
