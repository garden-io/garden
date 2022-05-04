/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PrimitiveMap, joiEnvVars, joiPrimitive, joi, joiIdentifier } from "./config/common"
import { ConfigGraph } from "./graph/config-graph"
import { joiArray } from "./config/common"
import { GraphResults } from "./graph/solver"
import { ActionKind, actionKinds, BaseAction } from "./actions/base"

interface RuntimeDependency {
  moduleName: string
  name: string
  outputs: PrimitiveMap
  kind: ActionKind
  version: string
}

export type RuntimeContext = {
  envVars: PrimitiveMap
  dependencies: RuntimeDependency[]
}

export const emptyRuntimeContext = {
  envVars: {},
  dependencies: [],
}

const runtimeDependencySchema = () =>
  joi.object().keys({
    name: joiIdentifier().required().description("The name of the dependency."),
    moduleName: joiIdentifier()
      .required()
      .description("The module name of the dependency. Defaults to the action name if it's not part of a module."),
    outputs: joiEnvVars().description("The outputs provided by the action (e.g. ingress URLs etc.)."),
    kind: joi
      .string()
      .valid(...actionKinds)
      .description("The kind of the dependency."),
    version: joi.string().required().description("The version of the dependency."),
  })

export const runtimeContextSchema = () =>
  joi
    .object()
    .options({ presence: "required" })
    .keys({
      envVars: joi
        .object()
        .pattern(/.+/, joiPrimitive())
        .default(() => ({}))
        .unknown(false)
        .description(
          "Key/value map of environment variables. Keys must be valid POSIX environment variable names " +
            "(must be uppercase) and values must be primitives."
        ),
      dependencies: joiArray(runtimeDependencySchema()).description(
        "List of all the services and tasks that this service/task/test depends on, and their metadata."
      ),
    })

interface PrepareRuntimeContextParams {
  action: BaseAction
  graph: ConfigGraph
  graphResults: GraphResults
}

// TODO-G2: this needs a re-visit
/**
 * This function prepares the "runtime context" that's used to inform action about any dependency outputs.
 * It includes environment variables, that can be directly passed by provider handlers  to the underlying platform
 * (e.g. container environments), as well as a more detailed list of all  dependencies and the outputs for each of them.
 *
 * This should be called just ahead of calling relevant action handlers.
 */
export async function prepareRuntimeContext({
  action,
  graph,
  graphResults,
}: PrepareRuntimeContextParams): Promise<RuntimeContext> {
  const envVars = {
    GARDEN_VERSION: action.versionString(),
    GARDEN_MODULE_VERSION: action.moduleVersion().versionString,
  }

  const dependencies: RuntimeDependency[] = []

  for (const ref of action.getDependencyReferences()) {
    const dep = graph.getActionByRef(ref)

    const result = graphResults[dep.key()]
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

  return { envVars, dependencies }
}
