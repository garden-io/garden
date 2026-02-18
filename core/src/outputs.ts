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
import { deepEvaluate } from "./template/evaluate.js"
import { scanTemplateReferences, resolveTemplateNeeds } from "./template/lazy-resolve.js"

/**
 * Resolves all declared project outputs. If necessary, this will resolve providers and modules, and ensure services
 * and tasks have been deployed and run, so that relevant template strings can be fully resolved.
 */
export async function resolveProjectOutputs(garden: Garden, log: Log): Promise<OutputSpec[]> {
  if (garden.rawOutputs.length === 0) {
    return []
  }

  const dummyContext = new OutputConfigContext({
    garden,
    resolvedProviders: {},
    variables: garden.variables,
    modules: [],
  })

  const needs = scanTemplateReferences(garden.rawOutputs, dummyContext)

  if (!needs.hasReferences) {
    // @ts-expect-error todo: correct types for unresolved configs
    return deepEvaluate(garden.rawOutputs, {
      context: dummyContext,
      opts: {},
    })
  }

  const resolved = await resolveTemplateNeeds(garden, log, needs)
  const configContext = await garden.getOutputConfigContext(log, resolved.modules, resolved.results)

  // @ts-expect-error todo: correct types for unresolved configs
  return deepEvaluate(garden.rawOutputs, {
    context: configContext,
    opts: {},
  })
}
