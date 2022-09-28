/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isString, mapValues, memoize, omit, pick } from "lodash"
import type {
  Action,
  ActionConfig,
  ActionConfigsByKey,
  ActionDependency,
  ActionDependencyAttributes,
  ActionKind,
  ActionWrapperParams,
  Executed,
  Resolved,
} from "../actions/types"
import {
  actionReferenceToString,
  addActionDependency,
  describeActionConfig,
  describeActionConfigWithPath,
} from "../actions/base"
import { BuildAction, buildActionConfigSchema } from "../actions/build"
import { DeployAction, deployActionConfigSchema } from "../actions/deploy"
import { RunAction, runActionConfigSchema } from "../actions/run"
import { TestAction, testActionConfigSchema } from "../actions/test"
import { noTemplateFields } from "../config/base"
import { ActionReference, parseActionReference } from "../config/common"
import type { GroupConfig } from "../config/group"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { ProjectConfigContext } from "../config/template-contexts/project"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, InternalError, PluginError } from "../exceptions"
import type { Garden } from "../garden"
import type { LogEntry } from "../logger/log-entry"
import { ActionTypeDefinition } from "../plugin/action-types"
import { getActionTypeBases } from "../plugins"
import type { ActionRouter } from "../router/router"
import { getExecuteTaskForAction } from "../tasks/helpers"
import { ResolveActionTask } from "../tasks/resolve-action"
import { getActionTemplateReferences, resolveTemplateStrings } from "../template-string/template-string"
import { dedent } from "../util/string"
import { resolveVariables } from "./common"
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
      config.internal.groupName = group.name
      config.internal.configFilePath = group.internal?.configFilePath

      const key = actionReferenceToString(config)
      const existing = configsByKey[key]

      if (existing) {
        throw actionNameConflictError(existing, config, garden.projectRoot)
      }
      configsByKey[key] = config
    }
  }

  const router = await garden.getActionRouter()

  // TODO-G2: Maybe we could optimize resolving tree versions, avoid parallel scanning of the same directory etc.
  const graph = new MutableConfigGraph({ actions: [], moduleGraph, groups: groupConfigs })

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

  const actionTypes = await garden.getActionTypes()
  const compatibleTypes = [
    config.type,
    ...getActionTypeBases(actionTypes[config.kind][config.type], actionTypes[config.kind]).map((t) => t.name),
  ]
  const definition = actionTypes[config.kind][config.type]

  const dependencies = dependenciesFromActionConfig(config, configsByKey, definition)
  const treeVersion = await garden.vcs.getTreeVersion(log, garden.projectName, config)

  const variables = await resolveVariables({
    basePath: config.internal.basePath,
    variables: config.variables,
    varfiles: config.varfiles,
  })

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
  const status = log.info({ msg: `Resolving ${action.longDescription()}`, status: "active" })

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

  status.setState({ status: "done" })

  return <Resolved<T>>(<unknown>results.results.getResult(task)!.result!.outputs.resolvedAction)
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

  return <ResolvedActions<T>>(<unknown>mapValues(results.results.getMap(), (r) => r!.result!.outputs.resolvedAction))
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

  return <Executed<T>>(<unknown>results.results.getResult(task)!.result!.outputs.executedAction)
}

const getActionConfigContextKeys = memoize(() => {
  const schema = buildActionConfigSchema()
  const configKeys = schema.describe().keys
  return Object.entries(configKeys)
    .map(([k, v]) => ((<any>v).meta?.templateContext === ProjectConfigContext ? k : null))
    .filter(isString)
})

function getActionSchema(kind: ActionKind) {
  switch (kind) {
    case "Build":
      return buildActionConfigSchema()
    case "Deploy":
      return deployActionConfigSchema()
    case "Run":
      return runActionConfigSchema()
    case "Test":
      return testActionConfigSchema()
    default:
      return kind // exhaustive type check, kind must have type 'never' here
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
    const { spec = {}, variables = {} } = config

    // Validate fully resolved keys (the above + those that don't allow any templating)
    config = validateWithPath({
      config: {
        ...config,
        variables: {},
        spec: {},
      },
      schema: getActionSchema(config.kind),
      configType: `${describeActionConfig(config)}`,
      name: config.name,
      path: config.internal.basePath,
      projectRoot: garden.projectRoot,
    })

    config = { ...config, variables, spec }

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

  const { config: updatedConfig } = await router.configureAction({ config, log })

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

function dependenciesFromActionConfig(
  config: ActionConfig,
  configsByKey: ActionConfigsByKey,
  definition: ActionTypeDefinition<any>
) {
  const description = describeActionConfig(config)

  if (!config.dependencies) {
    config.dependencies = []
  }

  const deps: ActionDependency[] = config.dependencies.map((d) => {
    const { kind, name } = parseActionReference(d)
    return { kind, name, explicit: true, needsExecutedOutputs: false, needsStaticOutputs: false }
  })

  function addDep(ref: ActionReference, attributes: ActionDependencyAttributes) {
    addActionDependency({ ...ref, ...attributes }, deps)
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

      addDep(ref, { explicit: true, needsExecutedOutputs: false, needsStaticOutputs: false })
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

    addDep(ref, { explicit: true, needsExecutedOutputs: false, needsStaticOutputs: false })
  }

  // Action template references in spec/variables
  // -> We avoid depending on action execution when referencing static output keys
  const staticKeys = definition.outputs?.staticKeys

  for (const ref of getActionTemplateReferences(config)) {
    let needsExecuted = false

    const outputKey = ref.fullRef[3]

    if (ref.fullRef[2] === "outputs" && outputKey && staticKeys !== true && !staticKeys?.includes(<string>outputKey)) {
      needsExecuted = true
    }

    addDep(ref, { explicit: false, needsExecutedOutputs: needsExecuted, needsStaticOutputs: !needsExecuted })
  }

  return deps
}
