/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isString } from "lodash-es"
import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import type { ActionReference } from "../config/common.js"
import type { ExecutedAction, ResolvedAction } from "../actions/types.js"
import type { ConfigContext } from "../config/template-contexts/base.js"
import type { ConfigGraph } from "../graph/config-graph.js"
import type { GardenModule } from "../types/module.js"
import type { ProviderMap } from "../config/provider.js"
import { GraphResults } from "../graph/results.js"
import { defaultVisitorOpts, getContextLookupReferences, visitAll } from "./analysis.js"
import type { ActionTemplateReference } from "../config/references.js"
import { extractActionReference, extractRuntimeReference } from "../config/references.js"
import { actionRefNeedsExecution, getStaticOutputKeys } from "../graph/actions.js"

/**
 * Describes what template references were found and what needs to be resolved.
 */
export interface TemplateResolutionNeeds {
  providers: string[]
  modules: string[]
  actions: ActionTemplateReference[]
  hasReferences: boolean
}

/**
 * The result of lazily resolving providers, modules, and actions.
 */
export interface ResolvedTemplateNeeds {
  graph?: ConfigGraph
  providers: ProviderMap
  modules: GardenModule[]
  results: GraphResults
  executedActions: (ResolvedAction | ExecutedAction)[]
}

/**
 * Scans template values against a context to determine what providers, modules, and actions
 * need to be resolved. This extracts the scan logic previously inlined in resolveProjectOutputs.
 */
export function scanTemplateReferences(value: any, context: ConfigContext): TemplateResolutionNeeds {
  const providers: string[] = []
  const modules: string[] = []
  const actions: ActionTemplateReference[] = []

  const generator = getContextLookupReferences(
    visitAll({
      value,
      opts: defaultVisitorOpts,
    }),
    context,
    {}
  )

  for (const finding of generator) {
    const keyPath = finding.keyPath
    const refName = keyPath[1]
    if (!refName || !isString(refName)) {
      continue
    }

    const refType = keyPath[0]
    if (refType === "providers" && isString(refName)) {
      providers.push(refName)
    } else if (refType === "modules" && isString(refName)) {
      modules.push(refName)
    } else if (refType === "runtime") {
      const runtimeRef = extractRuntimeReference(finding)
      actions.push(runtimeRef)
    } else if (refType === "actions") {
      const actionRef = extractActionReference(finding)
      actions.push(actionRef)
    }
  }

  const hasReferences = providers.length > 0 || modules.length > 0 || actions.length > 0

  return { providers, modules, actions, hasReferences }
}

/**
 * Lazily resolves providers, modules, and actions based on what template references
 * were detected. Only does work if references exist.
 *
 * Actions are categorized into those needing execution vs. only resolution, based on
 * whether the template references non-static output keys.
 */
export async function resolveTemplateNeeds(
  garden: Garden,
  log: Log,
  needs: TemplateResolutionNeeds
): Promise<ResolvedTemplateNeeds> {
  const providers = needs.providers.length > 0 ? await garden.resolveProviders({ log }) : {}

  const needsGraph = needs.actions.length > 0 || needs.modules.length > 0

  if (!needsGraph) {
    return { providers, modules: [], results: new GraphResults([]), executedActions: [] }
  }

  const graph = await garden.getConfigGraph({ log, emit: false })
  const modules = graph.getModules({ names: needs.modules })
  const actionTypes = await garden.getActionTypes()

  const baseParams = {
    garden,
    log,
    graph,
    forceActions: [],
    force: false,
  }

  // Categorize action refs: some only need resolution, others need full execution
  const actionsToExecute: ActionReference[] = []
  const actionsToResolve: ActionReference[] = []

  for (const ref of needs.actions) {
    const action = graph.getActionByRef(ref)
    const refStaticOutputKeys = getStaticOutputKeys(actionTypes, ref.kind, action.type)

    const { needsExecuted } = actionRefNeedsExecution({
      refKeyPath: ref.keyPath,
      refActionKind: ref.kind,
      refStaticOutputKeys,
    })

    if (needsExecuted) {
      actionsToExecute.push(ref)
    } else {
      actionsToResolve.push(ref)
    }
  }

  const executeTasks = actionsToExecute.map((ref) => {
    const action = graph.getActionByRef(ref)
    return action.getExecuteTask(baseParams)
  })

  const resolveTasks = actionsToResolve.map((ref) => {
    const action = graph.getActionByRef(ref)
    return action.getResolveTask(baseParams)
  })

  const allTasks = [...executeTasks, ...resolveTasks]

  const { results } =
    allTasks.length > 0
      ? await garden.processTasks({ tasks: allTasks, throwOnError: true })
      : { results: new GraphResults([]) }

  // Extract resolved/executed actions from graph results for the actions context
  const executedActions: (ResolvedAction | ExecutedAction)[] = []
  for (const result of results.getAll()) {
    const executed = (result?.result as any)?.executedAction
    if (executed) {
      executedActions.push(executed)
      continue
    }
    const resolved = (result?.result as any)?.outputs?.resolvedAction
    if (resolved) {
      executedActions.push(resolved)
    }
  }

  return { graph, providers, modules, results, executedActions }
}
