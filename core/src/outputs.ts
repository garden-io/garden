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
import { emptyRuntimeContext, RuntimeContext } from "./runtime-context"
import { LogEntry } from "./logger/log-entry"
import { OutputSpec } from "./config/project"
import { ActionReference, parseActionReference } from "./config/common"
import { ActionKind } from "./plugin/action-types"
import { getResolveTaskForAction } from "./tasks/base"

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
  let needActions: ActionReference[] = [] // TODO-G2

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
        needActions.push({ kind: "deploy", name: ref[2] as string })
      } else if (ref[1] === "tasks") {
        needActions.push({ kind: "run", name: ref[2] as string })
      }
    } else if (ref[0] === "action" && ref[1] && ref[2]) {
      needActions.push({ kind: <ActionKind>ref[1], name: ref[2] as string })
    }
  }

  const allRefs = [...needProviders, ...needModules, ...needActions]

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

  const baseParams = {
    garden,
    log,
    graph,
    fromWatch: false,
    devModeDeployNames: [],
    localModeDeployNames: [],
    forceActions: [],
    force: false,
  }

  const graphTasks = needActions.map((ref) => {
    const action = graph.getActionByRef(ref)
    return getResolveTaskForAction(action, baseParams)
  })

  const { results } =
    graphTasks.length > 0 ? await garden.processTasks({ tasks: graphTasks, log, throwOnError: true }) : { results: {} }

  const dependencies: RuntimeContext["dependencies"] = []

  for (const ref of Object.keys(results)) {
    const dep = graph.getActionByRef(parseActionReference(ref))

    const result = results[dep.key()]
    if (!result) {
      continue
    }

    dependencies.push({
      name: dep.name,
      kind: dep.kind,
      outputs: result.outputs || {},
      version: result.version,
      moduleName: dep.moduleName(),
    })
  }

  const runtimeContext: RuntimeContext = {
    envVars: {},
    dependencies,
  }

  const configContext = await garden.getOutputConfigContext(log, modules, runtimeContext)

  return resolveTemplateStrings(garden.rawOutputs, configContext)
}
