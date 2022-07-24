/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { isString, keyBy, mapValues, memoize, merge, omit, pick } from "lodash"
import {
  Action,
  ActionConfig,
  ActionDependency,
  actionReferenceToString,
  actionRefMatches,
  ActionWrapperParams,
  baseActionConfigSchema,
  describeActionConfig,
} from "../actions/base"
import { BuildAction, buildActionConfig } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { loadVarfile, noTemplateFields } from "../config/base"
import { ActionReference, DeepPrimitiveMap, parseActionReference } from "../config/common"
import { GroupConfig } from "../config/group"
import { ActionConfigContext } from "../config/template-contexts/actions"
import { ProjectConfigContext } from "../config/template-contexts/project"
import { validateWithPath } from "../config/validation"
import { ConfigurationError, InternalError, PluginError } from "../exceptions"
import type { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { BaseActionRouter } from "../router/base"
import { resolveTemplateStrings, getActionTemplateReferences } from "../template-string/template-string"
import { ConfigGraph, MutableConfigGraph } from "./config-graph"
import { ModuleGraph } from "./modules"

// TODO-G2: split this up
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
  configs: ActionConfig[]
  moduleGraph: ModuleGraph
}): Promise<MutableConfigGraph> {
  const actionTypeDefinitions = await garden.getActionTypes()

  const fromGroups = groupConfigs.flatMap((group) => {
    return group.actions.map((a) => ({ ...a, group }))
  })

  // TODO-G2: validate for naming conflicts between grouped and individual actions

  const configsByKey = keyBy([...fromGroups, ...configs], (a) => actionReferenceToString(a))

  // Fully resolve built-in fields that only support ProjectConfigContext
  const projectContextKeys = getActionConfigContextKeys()
  const builtinFieldContext = new ActionConfigContext(garden, garden.variables)

  function resolveTemplates(key: string) {
    let config = configsByKey[key]

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

    // TODO-G2: better error messages when something goes wrong here
    const resolvedOther = resolveTemplateStrings(omit(config, projectContextKeys), builtinFieldContext, {
      allowPartial: true,
    })
    config = { ...config, ...resolvedOther }

    configsByKey[key] = config
  }

  // Initial template resolution pass
  for (const key of Object.keys(configsByKey)) {
    resolveTemplates(key)
  }

  // Call configure handlers
  const router = await garden.getActionRouter()

  await Bluebird.map(Object.keys(configsByKey), async (key) => {
    const config = configsByKey[key]
    const description = describeActionConfig(config)
    const kindRouter: BaseActionRouter<any> = router[config.kind]

    const { config: updated } = await kindRouter.configure({ config, log })

    // -> Throw if trying to modify no-template fields
    for (const field of noTemplateFields) {
      if (config[field] !== updated[field]) {
        throw new PluginError(
          `Configure handler for ${description} attempted to modify the ${field} field, which is not allowed. Please report this as a bug.`,
          { config, field }
        )
      }
    }

    configsByKey[key] = updated

    // -> Resolve templates again, as above
    try {
      resolveTemplates(key)
    } catch (error) {
      throw new ConfigurationError(
        `Configure handler for ${config.type} ${config.kind} set a templated value on a config field which could not be resolved. This may be a bug in the plugin, please report this. Error: ${error}`,
        { config, error }
      )
    }
  })

  // Load varfiles
  const varfileVars = await Bluebird.props(
    mapValues(configsByKey, async (config) => {
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
    })
  )

  // Resolve tree versions
  // TODO-G2: Maybe we could optimize this, avoid parallel scanning of the same directory/context etc.
  const treeVersions = await Bluebird.props(
    mapValues(configsByKey, async (config) => {
      return garden.vcs.getTreeVersion(log, garden.projectName, config)
    })
  )

  // Extract all dependencies, including implicit dependencies
  const dependencies: { [key: string]: ActionDependency[] } = {}

  for (const config of Object.values(configsByKey)) {
    const description = describeActionConfig(config)

    if (!config.dependencies) {
      config.dependencies = []
    }

    const deps: ActionDependency[] = config.dependencies.map((d) => {
      const { kind, name } = parseActionReference(d)
      return { kind, name, type: "explicit" }
    })

    function addImplicitDep(ref: ActionReference) {
      for (const dep of deps) {
        if (actionRefMatches(ref, dep)) {
          return
        }
      }
      deps.push({ ...ref, type: "implicit" })
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

        addImplicitDep(ref)
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

      addImplicitDep(ref)
    }

    // -> Action template references in spec/variables
    for (const ref of getActionTemplateReferences(config)) {
      addImplicitDep(ref)
    }
  }

  const graph = new MutableConfigGraph({ actions: [], moduleGraph })

  for (const [key, config] of Object.entries(configsByKey)) {
    let action: Action

    const variables: DeepPrimitiveMap = {}
    // TODO-G2: should we change the precedence order here?
    merge(variables, varfileVars[key])
    merge(variables, garden.cliVariables)

    const params: ActionWrapperParams<any> = {
      baseBuildDirectory: garden.buildStaging.buildDirPath,
      config,
      dependencies: dependencies[key],
      graph,
      projectRoot: garden.projectRoot,
      treeVersion: treeVersions[key],
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

    graph.addAction(action)
  }

  graph.validate()

  return graph
}

const getActionConfigContextKeys = memoize(() => {
  const schema = buildActionConfig()
  const configKeys = schema.describe().keys
  return Object.entries(configKeys)
    .map(([k, v]) => ((<any>v).meta.templateContext === ProjectConfigContext ? k : null))
    .filter(isString)
})
