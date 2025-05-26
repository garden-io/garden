/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "./garden.js"
import { OutputConfigContext } from "./config/template-contexts/module.js"
import type { Log } from "./logger/log-entry.js"
import type { OutputSpec } from "./config/project.js"
import type { ActionReference } from "./config/common.js"
import { GraphResults } from "./graph/results.js"
import { defaultVisitorOpts, getContextLookupReferences, visitAll } from "./template/analysis.js"
import { isString } from "lodash-es"
import type { ObjectWithName } from "./util/util.js"
import { extractActionReference, extractRuntimeReference } from "./config/references.js"
import { deepEvaluate } from "./template/evaluate.js"

/**
 * Resolves all declared project outputs. If necessary, this will resolve providers and modules, and ensure services
 * and tasks have been deployed and run, so that relevant template strings can be fully resolved.
 */
export async function resolveProjectOutputs(garden: Garden, log: Log): Promise<OutputSpec[]> {
  if (garden.rawOutputs.length === 0) {
    return []
  }

  // Check for template references to figure out what needs to be resolved
  const needProviders: string[] = []
  const needModules: string[] = []
  const needActions: ActionReference[] = []

  const generator = getContextLookupReferences(
    visitAll({
      value: garden.rawOutputs as ObjectWithName[],
      opts: defaultVisitorOpts,
    }),
    new OutputConfigContext({
      garden,
      resolvedProviders: {},
      variables: garden.variables,
      modules: [],
    }),
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
      needProviders.push(refName)
    } else if (refType === "modules" && isString(refName)) {
      needModules.push(refName)
    } else if (refType === "runtime") {
      const runtimeRef = extractRuntimeReference(finding)
      needActions.push(runtimeRef)
    } else if (refType === "actions") {
      const actionRef = extractActionReference(finding)
      needActions.push(actionRef)
    }
  }

  const allRefs = [...needProviders, ...needModules, ...needActions]

  if (allRefs.length === 0) {
    // @ts-expect-error todo: correct types for unresolved configs
    return deepEvaluate(garden.rawOutputs, {
      context: new OutputConfigContext({
        garden,
        resolvedProviders: {},
        variables: garden.variables,
        modules: [],
      }),
      opts: {},
    })
  }

  // Make sure all referenced services and tasks are ready and collect their outputs for the runtime context
  const graph = await garden.getConfigGraph({ log, emit: false })
  const modules = graph.getModules({ names: needModules })

  const baseParams = {
    garden,
    log,
    graph,
    forceActions: [],
    force: false,
  }

  const graphTasks = needActions.map((ref) => {
    // TODO: we may not need full execution for all these actions
    const action = graph.getActionByRef(ref)
    return action.getExecuteTask(baseParams)
  })

  const { results } =
    graphTasks.length > 0
      ? await garden.processTasks({ tasks: graphTasks, throwOnError: true })
      : { results: new GraphResults([]) }

  const configContext = await garden.getOutputConfigContext(log, modules, results)

  // @ts-expect-error todo: correct types for unresolved configs
  return deepEvaluate(garden.rawOutputs, {
    context: configContext,
    opts: {},
  })
}
