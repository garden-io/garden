/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "./garden"
import { collectTemplateReferences, resolveTemplateStrings } from "./template-string/template-string"
import { OutputConfigContext } from "./config/template-contexts/module"
import { emptyRuntimeContext, prepareRuntimeContext } from "./runtime-context"
import { DeployTask } from "./tasks/deploy"
import { TaskTask } from "./tasks/task"
import { GraphResults } from "./task-graph"
import { getServiceStatuses, getRunTaskResults } from "./tasks/base"
import { LogEntry } from "./logger/log-entry"
import { OutputSpec } from "./config/project"

/**
 * Resolves all declared project outputs. If necessary, this will resolve providers and modules, and ensure services
 * and tasks have been deployed and run, so that relevant template strings can be fully resolved.
 */
export async function resolveProjectOutputs(garden: Garden, log: LogEntry): Promise<OutputSpec[]> {
  if (garden.rawOutputs.length === 0) {
    return []
  }

  // Check for template references to figure out what needs to be resolved
  let needProviders: string[] = []
  let needModules: string[] = []
  let needServices: string[] = []
  let needTasks: string[] = []

  const templateRefs = collectTemplateReferences(garden.rawOutputs)

  if (templateRefs.length === 0) {
    // Nothing to resolve
    return garden.rawOutputs
  }

  for (const ref of templateRefs) {
    if (!ref[1]) {
      continue
    }
    if (ref[0] === "providers") {
      needProviders.push(ref[1] as string)
    } else if (ref[0] === "modules") {
      needModules.push(ref[1] as string)
    } else if (ref[0] === "runtime" && ref[2]) {
      if (ref[1] === "services") {
        needServices.push(ref[2] as string)
      } else if (ref[1] === "tasks") {
        needTasks.push(ref[2] as string)
      }
    }
  }

  const allRefs = [...needProviders, ...needModules, ...needServices, ...needTasks]

  if (allRefs.length === 0) {
    // No need to resolve any entities
    return resolveTemplateStrings(
      garden.rawOutputs,
      new OutputConfigContext({
        garden,
        resolvedProviders: {},
        variables: garden.variables,
        modules: [],
        runtimeContext: emptyRuntimeContext,
        partialRuntimeResolution: false,
      })
    )
  }

  // Make sure all referenced services and tasks are ready and collect their outputs for the runtime context
  const graph = await garden.getConfigGraph({ log, emit: false })
  const modules = graph.getModules({ names: needModules })
  const services = graph.getServices({ names: needServices })
  const tasks = graph.getTasks({ names: needTasks })

  const graphTasks = [
    ...services.map(
      (service) =>
        new DeployTask({
          force: false,
          forceBuild: false,
          garden,
          graph,
          log,
          service,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })
    ),
    ...tasks.map(
      (task) =>
        new TaskTask({
          force: false,
          forceBuild: false,
          garden,
          graph,
          log,
          task,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })
    ),
  ]

  const dependencyResults: GraphResults = graphTasks.length > 0 ? await garden.processTasks(graphTasks) : {}

  const serviceStatuses = getServiceStatuses(dependencyResults)
  const taskResults = getRunTaskResults(dependencyResults)

  const runtimeContext = await prepareRuntimeContext({
    garden,
    graph,
    dependencies: {
      build: [],
      deploy: services,
      run: tasks,
      test: [],
    },
    version: garden.version,
    moduleVersion: garden.version,
    serviceStatuses,
    taskResults,
  })

  const configContext = await garden.getOutputConfigContext(log, modules, runtimeContext)

  return resolveTemplateStrings(garden.rawOutputs, configContext)
}
