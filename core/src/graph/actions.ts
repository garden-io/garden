/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isString, mapValues, memoize, omit, pick } from "lodash"
import {
  Action,
  ActionConfig,
  ActionConfigsByKey,
  ActionDependency,
  ActionDependencyAttributes,
  ActionKind,
  actionKinds,
  ActionMode,
  ActionModeMap,
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
import { BuildAction, buildActionConfigSchema, isBuildActionConfig } from "../actions/build"
import { DeployAction, deployActionConfigSchema, isDeployActionConfig } from "../actions/deploy"
import { RunAction, runActionConfigSchema, isRunActionConfig } from "../actions/run"
import { TestAction, testActionConfigSchema, isTestActionConfig } from "../actions/test"
import { noTemplateFields } from "../config/base"
import { ActionReference, describeSchema, JoiDescription, parseActionReference } from "../config/common"
import type { GroupConfig } from "../config/group"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, InternalError, PluginError, ValidationError } from "../exceptions"
import type { Garden } from "../garden"
import type { Log } from "../logger/log-entry"
import type { ActionTypeDefinition } from "../plugin/action-types"
import { getActionTypeBases } from "../plugins"
import type { ActionRouter } from "../router/router"
import { getExecuteTaskForAction } from "../tasks/helpers"
import { ResolveActionTask } from "../tasks/resolve-action"
import { getActionTemplateReferences, resolveTemplateStrings } from "../template-string/template-string"
import { dedent } from "../util/string"
import { resolveVariables } from "./common"
import { ConfigGraph, MutableConfigGraph } from "./config-graph"
import type { ModuleGraph } from "./modules"
import chalk from "chalk"
import type { MaybeUndefined } from "../util/util"
import minimatch from "minimatch"

export async function actionConfigsToGraph({
  garden,
  log,
  groupConfigs,
  configs,
  moduleGraph,
  actionModes,
}: {
  garden: Garden
  log: Log
  groupConfigs: GroupConfig[]
  configs: ActionConfig[]
  moduleGraph: ModuleGraph
  actionModes: ActionModeMap
}): Promise<MutableConfigGraph> {
  const configsByKey: ActionConfigsByKey = {}

  function addConfig(config: ActionConfig) {
    if (!actionKinds.includes(config.kind)) {
      throw new ConfigurationError(`Unknown action kind: ${config.kind}`, { config })
    }

    const key = actionReferenceToString(config)
    const existing = configsByKey[key]

    if (existing) {
      throw actionNameConflictError(existing, config, garden.projectRoot)
    }
    configsByKey[key] = config
  }

  configs.forEach(addConfig)

  for (const group of groupConfigs) {
    for (const config of group.actions) {
      config.internal.groupName = group.name

      if (group.internal?.configFilePath) {
        config.internal.configFilePath = group.internal.configFilePath
      }

      addConfig(config)
    }
  }

  const router = await garden.getActionRouter()

  // TODO-G2: Maybe we could optimize resolving tree versions, avoid parallel scanning of the same directory etc.
  const graph = new MutableConfigGraph({ actions: [], moduleGraph, groups: groupConfigs })

  await Bluebird.map(Object.entries(configsByKey), async ([key, config]) => {
    // Apply action modes
    let mode: ActionMode = "default"
    let explicitMode = false // set if a key is explicitly set (as opposed to a wildcard match)

    for (const pattern of actionModes.sync || []) {
      if (key === pattern) {
        explicitMode = true
        mode = "sync"
        log.silly(`Action ${key} set to ${mode} mode, matched on exact key`)
        break
      } else if (minimatch(key, pattern)) {
        mode = "sync"
        log.silly(`Action ${key} set to ${mode} mode, matched with pattern '${pattern}'`)
        break
      }
    }

    // Local mode takes precedence over sync
    // TODO: deduplicate
    for (const pattern of actionModes.local || []) {
      if (key === pattern) {
        explicitMode = true
        mode = "local"
        log.silly(`Action ${key} set to ${mode} mode, matched on exact key`)
        break
      } else if (minimatch(key, pattern)) {
        mode = "local"
        log.silly(`Action ${key} set to ${mode} mode, matched with pattern '${pattern}'`)
        break
      }
    }

    try {
      const action = await actionFromConfig({ garden, graph, config, router, log, configsByKey, mode })

      if (!action.supportsMode(mode)) {
        if (explicitMode) {
          log.warn(chalk.yellow(`${action.longDescription()} is not configured for or does not support ${mode} mode`))
        }
      }

      graph.addAction(action)
    } catch (error) {
      throw new ConfigurationError(
        chalk.redBright(
          `\nError processing config for ${chalk.white.bold(config.kind)} action ${chalk.white.bold(config.name)}:\n`
        ) + chalk.red(error.message),
        { error, config }
      )
    }
  })

  graph.validate()

  return graph
}

export async function actionFromConfig({
  garden,
  graph,
  config: inputConfig,
  router,
  log,
  configsByKey,
  mode,
}: {
  garden: Garden
  graph: ConfigGraph
  config: ActionConfig
  router: ActionRouter
  log: Log
  configsByKey: ActionConfigsByKey
  mode: ActionMode
}) {
  let action: Action

  // Call configure handler and validate
  const { config, supportedModes } = await preprocessActionConfig({ garden, config: inputConfig, router, log })

  const actionTypes = await garden.getActionTypes()
  const definition = actionTypes[config.kind][config.type]?.spec
  const compatibleTypes = [config.type, ...getActionTypeBases(definition, actionTypes[config.kind]).map((t) => t.name)]

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
    moduleName: config.internal.moduleName,
    moduleVersion: config.internal.moduleVersion,
    mode,
    supportedModes,
  }

  if (isBuildActionConfig(config)) {
    action = new BuildAction(params)
  } else if (isDeployActionConfig(config)) {
    action = new DeployAction(params)
  } else if (isRunActionConfig(config)) {
    action = new RunAction(params)
  } else if (isTestActionConfig(config)) {
    action = new TestAction(params)
  } else {
    const _exhaustiveCheck: never = config
    // This will be caught earlier
    throw new InternalError(`Invalid kind '${config["kind"]}' encountered when resolving actions.`, {
      config: _exhaustiveCheck,
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
    Please rename one of the two to avoid the conflict.
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
  log: Log
}): Promise<Resolved<T>> {
  log.info(`Resolving ${action.longDescription()}`)

  const task = new ResolveActionTask({
    garden,
    action,
    graph,
    log,
    force: true,
  })

  const results = await garden.processTasks({ tasks: [task], log, throwOnError: true })

  log.info(`Done!`)

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
  log: Log
}): Promise<ResolvedActions<T>> {
  const tasks = actions.map(
    (action) =>
      new ResolveActionTask({
        garden,
        action,
        graph,
        log,
        force: true,
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
  log: Log
}): Promise<Executed<T>> {
  const task = getExecuteTaskForAction(action, {
    garden,
    graph,
    log,
    force: true,
  })

  const results = await garden.processTasks({ tasks: [task], log, throwOnError: true })

  return <Executed<T>>(<unknown>results.results.getResult(task)!.result!.executedAction)
}

const getBuiltinConfigContextKeys = memoize(() => {
  const schema = buildActionConfigSchema()
  const configKeys = schema.describe().keys
  return Object.entries(configKeys)
    .map(([k, v]) => ((<JoiDescription>v).metas?.find((m) => m.templateContext === ActionConfigContext) ? k : null))
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
      // this can be rewritten as `satisfies` with TypeScript 4.9+
      const _exhaustiveCheck: never = kind
      return _exhaustiveCheck
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
  log: Log
}) {
  const builtinConfigKeys = getBuiltinConfigContextKeys()
  const builtinFieldContext = new ActionConfigContext(garden)

  function resolveTemplates() {
    // Fully resolve built-in fields that only support ProjectConfigContext
    // TODO-G2: better error messages when something goes wrong here
    const resolvedBuiltin = resolveTemplateStrings(pick(config, builtinConfigKeys), builtinFieldContext, {
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
      configType: describeActionConfig(config),
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
    const resolvedOther = resolveTemplateStrings(omit(config, builtinConfigKeys), builtinFieldContext, {
      allowPartial: true,
    })
    config = { ...config, ...resolvedOther }
  }

  resolveTemplates()

  const description = describeActionConfig(config)

  const { config: updatedConfig, supportedModes } = await router.configureAction({ config, log })

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

  return { config, supportedModes }
}

function dependenciesFromActionConfig(
  config: ActionConfig,
  configsByKey: ActionConfigsByKey,
  definition: MaybeUndefined<ActionTypeDefinition<any>>
) {
  const description = describeActionConfig(config)

  if (!config.dependencies) {
    config.dependencies = []
  }

  const deps: ActionDependency[] = config.dependencies.map((d) => {
    try {
      const { kind, name } = parseActionReference(d)
      return { kind, name, explicit: true, needsExecutedOutputs: false, needsStaticOutputs: false }
    } catch (error) {
      throw new ValidationError(`Invalid dependency specified: ${error.message}`, { error, config })
    }
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
  const staticKeys = definition?.staticOutputsSchema ? describeSchema(definition.staticOutputsSchema).keys : []

  for (const ref of getActionTemplateReferences(config)) {
    let needsExecuted = false

    const outputKey = ref.fullRef[4]

    if (ref.fullRef[3] === "outputs" && outputKey && !staticKeys?.includes(<string>outputKey)) {
      needsExecuted = true
    }

    addDep(ref, { explicit: false, needsExecutedOutputs: needsExecuted, needsStaticOutputs: !needsExecuted })
  }

  return deps
}
