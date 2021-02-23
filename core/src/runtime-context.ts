/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getEnvVarName } from "./util/util"
import { PrimitiveMap, joiEnvVars, joiPrimitive, joi, joiIdentifier, moduleVersionSchema } from "./config/common"
import { Garden } from "./garden"
import { ConfigGraph, DependencyRelations } from "./config-graph"
import { ServiceStatus } from "./types/service"
import { RunTaskResult } from "./types/plugin/task/runTask"
import { joiArray } from "./config/common"
import { isPrimitive } from "util"

interface RuntimeDependency {
  moduleName: string
  name: string
  outputs: PrimitiveMap
  type: "build" | "service" | "task"
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
    name: joiIdentifier().description("The name of the service or task."),
    outputs: joiEnvVars().description("The outputs provided by the service (e.g. ingress URLs etc.)."),
    type: joi.string().valid("service", "task").description("The type of the dependency."),
    version: moduleVersionSchema(),
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
  garden: Garden
  graph: ConfigGraph
  dependencies: DependencyRelations
  serviceStatuses: { [name: string]: ServiceStatus }
  taskResults: { [name: string]: RunTaskResult }
  version: string
  moduleVersion: string
}

/**
 * This function prepares the "runtime context" that's used to inform services and tasks about any dependency outputs
 * and other runtime values. It includes environment variables, that can be directly passed by provider handlers to
 * the underlying platform (e.g. container environments), as well as a more detailed list of all runtime
 * and module dependencies and the outputs for each of them.
 *
 * This should be called just ahead of calling relevant service, task and test action handlers.
 */
export async function prepareRuntimeContext({
  garden,
  dependencies,
  serviceStatuses,
  taskResults,
  version,
  moduleVersion,
}: PrepareRuntimeContextParams): Promise<RuntimeContext> {
  const envVars = {
    GARDEN_VERSION: version,
    GARDEN_MODULE_VERSION: moduleVersion,
  }

  // DEPRECATED: Remove in v0.13
  for (const [key, value] of Object.entries(garden.variables)) {
    // Only store primitive values, objects and arrays cause issues further down.
    if (isPrimitive(value)) {
      const envVarName = `GARDEN_VARIABLES_${getEnvVarName(key)}`
      envVars[envVarName] = value
    }
  }

  const result: RuntimeContext = {
    envVars,
    dependencies: [],
  }

  for (const m of dependencies.build) {
    result.dependencies.push({
      moduleName: m.name,
      name: m.name,
      outputs: m.outputs,
      type: "build",
      version: m.version.versionString,
    })
  }

  for (const service of dependencies.deploy) {
    // If a service status is not available, we tolerate that here. That may impact dependant service status reports,
    // but that is expected behavior. If a service becomes available or changes its outputs, the context changes.
    // We leave it to providers to indicate what the impact of that difference is.
    const status = serviceStatuses[service.name] || {}
    const outputs = status.outputs || {}

    result.dependencies.push({
      moduleName: service.module.name,
      name: service.name,
      outputs,
      type: "service",
      version: service.version,
    })
  }

  for (const task of dependencies.run) {
    // If a task result is not available, we tolerate that here. That may impact dependant service status reports,
    // but that is expected behavior. If a task is later run for the first time or its output changes, the context
    // changes. We leave it to providers to indicate what the impact of that difference is.
    const taskResult = taskResults[task.name] || {}
    const outputs = taskResult.outputs || {}

    result.dependencies.push({
      moduleName: task.module.name,
      name: task.name,
      outputs,
      type: "task",
      version: task.version,
    })
  }

  // Make the full list of dependencies without outputs available as JSON as well
  result.envVars.GARDEN_DEPENDENCIES = JSON.stringify(result.dependencies.map((d) => ({ ...d, outputs: undefined })))
  return result
}
