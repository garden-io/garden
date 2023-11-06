/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "./garden.js"
import { collectTemplateReferences, resolveTemplateStrings } from "./template-string/template-string.js"
import { OutputConfigContext } from "./config/template-contexts/module.js"
import type { Log } from "./logger/log-entry.js"
import type { OutputSpec } from "./config/project.js"
import type { ActionReference } from "./config/common.js"
import type { ActionKind } from "./plugin/action-types.js"
import { GraphResults } from "./graph/results.js"

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
        needActions.push({ kind: "Deploy", name: ref[2] as string })
      } else if (ref[1] === "tasks") {
        needActions.push({ kind: "Run", name: ref[2] as string })
      }
    } else if (ref[0] === "actions" && ref[1] && ref[2]) {
      needActions.push({ kind: <ActionKind>ref[1], name: ref[2] as string })
    }
  }

  const allRefs = [...needProviders, ...needModules, ...needActions]

  const source = { yamlDoc: garden.getProjectConfig().internal.yamlDoc, basePath: ["outputs"] }

  if (allRefs.length === 0) {
    // No need to resolve any entities
    return resolveTemplateStrings({
      value: garden.rawOutputs,
      context: new OutputConfigContext({
        garden,
        resolvedProviders: {},
        variables: garden.variables,
        modules: [],
        partialRuntimeResolution: false,
      }),
      source,
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
      ? await garden.processTasks({ tasks: graphTasks, log, throwOnError: true })
      : { results: new GraphResults([]) }

  const configContext = await garden.getOutputConfigContext(log, modules, results)

  return resolveTemplateStrings({ value: garden.rawOutputs, context: configContext, source })
}
