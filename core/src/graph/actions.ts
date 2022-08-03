/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isString, memoize, merge, omit, pick } from "lodash"
import {
  Action,
  ActionConfig,
  ActionConfigsByKey,
  ActionDependency,
  actionReferenceToString,
  actionRefMatches,
  ActionWrapperParams,
  baseActionConfigSchema,
  describeActionConfig,
  describeActionConfigWithPath,
  Executed,
  Resolved,
} from "../actions/base"
import { BuildAction, buildActionConfig, isBuildAction } from "../actions/build"
import { DeployAction, isDeployAction } from "../actions/deploy"
import { isRunAction, RunAction } from "../actions/run"
import { isTestAction, TestAction } from "../actions/test"
import { loadVarfile, noTemplateFields } from "../config/base"
import { ActionReference, DeepPrimitiveMap, parseActionReference } from "../config/common"
import type { GroupConfig } from "../config/group"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { ProjectConfigContext } from "../config/template-contexts/project"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, InternalError, PluginError } from "../exceptions"
import type { Garden } from "../garden"
import type { LogEntry } from "../logger/log-entry"
import { getActionTypeBases } from "../plugins"
import type { BaseActionRouter } from "../router/base"
import type { ActionRouter } from "../router/router"
import { BaseActionTaskParams } from "../tasks/base"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { ResolveActionTask } from "../tasks/resolve-action"
import { RunTask } from "../tasks/run"
import { TestTask } from "../tasks/test"
import { resolveTemplateStrings, getActionTemplateReferences } from "../template-string/template-string"
import { dedent } from "../util/string"
import { ConfigGraph, MutableConfigGraph } from "./config-graph"
import type { ModuleGraph } from "./modules"

export async function actionConfigsToGraph({
  garden,
  log,
  groupConfigs,
  configs,
  moduleGraph,
}: {
  garden: Garden
  log: LogEntry
  groupConfigs: GroupConfig[]
  configs: ActionConfigsByKey
  moduleGraph: ModuleGraph
}): Promise<MutableConfigGraph> {
  const configsByKey = { ...configs }

  for (const group of groupConfigs) {
    for (const config of group.actions) {
      if (!config.internal) {
        config.internal = {}
      }
      config.internal.groupName = group.name
      config.internal.configFilePath = group.internal?.configFilePath

      const key = actionReferenceToString(config)
      const existing = configsByKey[key]

      if (existing) {
        throw actionNameConflictError(existing, config, garden.projectRoot)
      }
    }
  }

  const router = await garden.getActionRouter()

  // TODO-G2: Maybe we could optimize resolving tree versions, avoid parallel scanning of the same directory etc.
  const graph = new MutableConfigGraph({ actions: [], moduleGraph })

  await Bluebird.map(Object.values(configsByKey), async (config) => {
    const action = await actionFromConfig({ garden, graph, config, router, log, configsByKey })
    graph.addAction(action)
  })

  graph.validate()

  return graph
}

export async function actionFromConfig({
  garden,
  graph,
  config,
  router,
  log,
  configsByKey,
}: {
  garden: Garden
  graph: ConfigGraph
  config: ActionConfig
  router: ActionRouter
  log: LogEntry
  configsByKey: ActionConfigsByKey
}) {
  let action: Action

  // Call configure handler and validate
  config = await preprocessActionConfig({ garden, config, router, log })

  const dependencies = dependenciesFromActionConfig(config, configsByKey)
  const treeVersion = await garden.vcs.getTreeVersion(log, garden.projectName, config)

  const variables: DeepPrimitiveMap = {}
  // TODO-G2: should we change the precedence order here?
  merge(variables, await resolveActionVarfiles(config))
  merge(variables, garden.cliVariables)

  const actionTypes = await garden.getActionTypes()
  const compatibleTypes = [
    config.type,
    ...getActionTypeBases(actionTypes[config.type], actionTypes[config.kind]).map((t) => t.name),
  ]

  const params: ActionWrapperParams<any> = {
    baseBuildDirectory: garden.buildStaging.buildDirPath,
    compatibleTypes,
    config,
    dependencies,
    graph,
    projectRoot: garden.projectRoot,
    treeVersion,
    variables,
  }

  if (config.kind === "Build") {
    action = new BuildAction(params)
  } else if (config.kind === "Deploy") {
    action = new DeployAction(params)
  } else if (config.kind === "Run") {
    action = new RunAction(params)
  } else if (config.kind === "Test") {
    action = new TestAction(params)
  } else {
    // This will be caught earlier
    throw new InternalError(`Invalid kind '${config["kind"]}' encountered when resolving actions.`, {
      config,
    })
  }

  return action
}

export function actionNameConflictError(configA: ActionConfig, configB: ActionConfig, rootPath: string) {
  return new ConfigurationError(
    dedent`
    Found two actions of the same name and kind:
      - ${describeActionConfigWithPath(configA, rootPath)}
      - ${describeActionConfigWithPath(configB, rootPath)}
    Please rename on of the two to avoid the conflict.
    `,
    { configA, configB }
  )
}

// TODO-G2
/**
 * Helper for resolving a single action.
 *
 * This runs the GraphSolver as needed to resolve dependencies and fully resolve the action's spec.
 */
export async function resolveAction<T extends Action>({
  garden,
  graph,
  action,
  log,
}: {
  garden: Garden
  graph: ConfigGraph
  action: T
  log: LogEntry
}): Promise<Resolved<T>> {
  const task = new ResolveActionTask({
    garden,
    action,
    graph,
    log,
    force: true,
    devModeDeployNames: [],
    localModeDeployNames: [],
    fromWatch: false,
  })

  const results = await garden.processTasks({ tasks: [task], log, throwOnError: true })

  return <Resolved<T>>(<unknown>results.results[task.getKey()]!)
}

export interface ResolvedActions<T extends Action> {
  [key: string]: Resolved<T>
}

/**
 * Helper for resolving specific actions.
 *
 * This runs the GraphSolver as needed to resolve dependencies and fully resolve the action specs.
 */
export async function resolveActions<T extends Action>({
  garden,
  graph,
  actions,
  log,
}: {
  garden: Garden
  graph: ConfigGraph
  actions: T[]
  log: LogEntry
}): Promise<ResolvedActions<T>> {
  const tasks = actions.map(
    (action) =>
      new ResolveActionTask({
        garden,
        action,
        graph,
        log,
        force: true,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })
  )

  const results = await garden.processTasks({ tasks, log, throwOnError: true })

  return <ResolvedActions<T>>(<unknown>results.results)
}

/**
 * Helper for executing a single action.
 *
 * This runs the GraphSolver as needed to resolve dependencies and execute the action if needed.
 */
export async function executeAction<T extends Action>({
  garden,
  graph,
  action,
  log,
}: {
  garden: Garden
  graph: ConfigGraph
  action: T
  log: LogEntry
}): Promise<Executed<T>> {
  const task = getExecuteTaskForAction(action, {
    garden,
    graph,
    log,
    force: true,
    devModeDeployNames: [],
    localModeDeployNames: [],
    fromWatch: false,
  })

  const results = await garden.processTasks({ tasks: [task], log, throwOnError: true })

  return <Executed<T>>(<unknown>results.results[task.getKey()]!)
}

const getActionConfigContextKeys = memoize(() => {
  const schema = buildActionConfig()
  const configKeys = schema.describe().keys
  return Object.entries(configKeys)
    .map(([k, v]) => ((<any>v).meta.templateContext === ProjectConfigContext ? k : null))
    .filter(isString)
})

export function getExecuteTaskForAction(action: Action, baseParams: Omit<BaseActionTaskParams, "action">) {
  if (isBuildAction(action)) {
    return new BuildTask({ ...baseParams, action })
  } else if (isDeployAction(action)) {
    return new DeployTask({ ...baseParams, action })
  } else if (isRunAction(action)) {
    return new RunTask({ ...baseParams, action })
  } else if (isTestAction(action)) {
    return new TestTask({ ...baseParams, action })
  } else {
    // Shouldn't happen
    throw new InternalError(`Unexpected action kind ${action.kind}`, { config: action.getConfig() })
  }
}

async function preprocessActionConfig({
  garden,
  config,
  router,
  log,
}: {
  garden: Garden
  config: ActionConfig
  router: ActionRouter
  log: LogEntry
}) {
  const projectContextKeys = getActionConfigContextKeys()
  const builtinFieldContext = new ActionConfigContext(garden)

  function resolveTemplates() {
    // Fully resolve built-in fields that only support ProjectConfigContext
    // TODO-G2: better error messages when something goes wrong here
    const resolvedBuiltin = resolveTemplateStrings(pick(config, projectContextKeys), builtinFieldContext, {
      allowPartial: false,
    })
    config = { ...config, ...resolvedBuiltin }

    // Validate fully resolved keys (the above + those that don't allow any templating)
    config = validateWithPath({
      config: {
        ...config,
        variables: {},
        spec: {},
      },
      schema: baseActionConfigSchema(),
      configType: `${describeActionConfig(config)}`,
      name: config.name,
      path: config.basePath,
      projectRoot: garden.projectRoot,
    })

    // TODO-G2: handle this
    // if (config.repositoryUrl) {
    //   const linkedSources = await getLinkedSources(garden, "module")
    //   config.path = await garden.loadExtSourcePath({
    //     name: config.name,
    //     linkedSources,
    //     repositoryUrl: config.repositoryUrl,
    //     sourceType: "module",
    //   })
    // }

    // Partially resolve other fields
    // TODO-G2: better error messages when something goes wrong here
    const resolvedOther = resolveTemplateStrings(omit(config, projectContextKeys), builtinFieldContext, {
      allowPartial: true,
    })
    config = { ...config, ...resolvedOther }
  }

  resolveTemplates()

  const description = describeActionConfig(config)
  const kindRouter: BaseActionRouter<any> = router[config.kind]

  const { config: updatedConfig } = await kindRouter.configure({ config, log })

  // -> Throw if trying to modify no-template fields
  for (const field of noTemplateFields) {
    if (config[field] !== updatedConfig[field]) {
      throw new PluginError(
        `Configure handler for ${description} attempted to modify the ${field} field, which is not allowed. Please report this as a bug.`,
        { config, field }
      )
    }
  }

  config = updatedConfig

  // -> Resolve templates again after configure handler
  // TODO-G2: avoid this if nothing changed in the configure handler
  try {
    resolveTemplates()
  } catch (error) {
    throw new ConfigurationError(
      `Configure handler for ${config.type} ${config.kind} set a templated value on a config field which could not be resolved. This may be a bug in the plugin, please report this. Error: ${error}`,
      { config, error }
    )
  }

  return config
}

async function resolveActionVarfiles(config: ActionConfig) {
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
    merge(output, vars)
  }

  return output
}

function dependenciesFromActionConfig(config: ActionConfig, configsByKey: ActionConfigsByKey) {
  const description = describeActionConfig(config)

  if (!config.dependencies) {
    config.dependencies = []
  }

  const deps: ActionDependency[] = config.dependencies.map((d) => {
    const { kind, name } = parseActionReference(d)
    return { kind, name, type: "explicit" }
  })

  function addImplicitDep(ref: ActionReference, executed: boolean) {
    for (const dep of deps) {
      if (actionRefMatches(ref, dep)) {
        return
      }
    }
    deps.push({ ...ref, type: executed ? "implicit-executed" : "implicit" })
  }

  if (config.kind === "Build") {
    // -> Build copyFrom field
    for (const copyFrom of config.copyFrom || []) {
      // TODO-G2: need to update this for parameterized actions
      const ref: ActionReference = { kind: "Build", name: copyFrom.build }
      const buildKey = actionReferenceToString(ref)

      if (!configsByKey[buildKey]) {
        throw new ConfigurationError(
          `${description} references Build ${copyFrom.build} in the \`copyFrom\` field, but no such Build action could be found`,
          { config, buildName: copyFrom.build }
        )
      }

      addImplicitDep(ref, true)
    }
  } else if (config.build) {
    // -> build field on runtime actions
    const ref: ActionReference = { kind: "Build", name: config.build }
    const buildKey = actionReferenceToString(ref)

    if (!configsByKey[buildKey]) {
      throw new ConfigurationError(
        `${description} references Build ${config.build} in the \`build\` field, but no such Build action could be found`,
        { config, buildName: config.build }
      )
    }

    addImplicitDep(ref, true)
  }

  // -> Action template references in spec/variables
  for (const ref of getActionTemplateReferences(config)) {
    // TODO-G2: tease apart runtime and static output references
    addImplicitDep(ref, true)
  }

  return deps
}
