/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { get, isEqual, join, set, uniqWith } from "lodash"
import { Module, getModuleKey } from "../types/module"
import {
  ConfigurationError,
} from "../exceptions"
import { Service } from "../types/service"
import { Task } from "../types/task"

export type Cycle = string[]

/*
  Implements a variation on the Floyd-Warshall algorithm to compute minimal cycles.

  This is approximately O(m^3) + O(s^3), where m is the number of modules and s is the number of services.

  Throws an error if cycles were found.
*/
export async function detectCircularDependencies(modules: Module[], services: Service[], tasks: Task[]) {
  // Sparse matrices
  const buildGraph = {}
  const runtimeGraph = {}

  /*
    There's no need to account for test dependencies here, since any circularities there
    are accounted for via service dependencies.
    */
  for (const module of modules) {
    // Build dependencies
    for (const buildDep of module.build.dependencies) {
      const depName = getModuleKey(buildDep.name, buildDep.plugin)
      set(buildGraph, [module.name, depName], { distance: 1, next: depName })
    }

    // Runtime (service & task) dependencies
    for (const service of module.serviceConfigs || []) {
      for (const depName of service.dependencies) {
        set(runtimeGraph, [service.name, depName], { distance: 1, next: depName })
      }
    }

    for (const task of module.taskConfigs || []) {
      for (const depName of task.dependencies) {
        set(runtimeGraph, [task.name, depName], { distance: 1, next: depName })
      }
    }
  }

  const serviceNames = services.map(s => s.name)
  const taskNames = tasks.map(w => w.name)
  const buildCycles = detectCycles(buildGraph, modules.map(m => m.name))
  const runtimeCycles = detectCycles(runtimeGraph, serviceNames.concat(taskNames))

  if (buildCycles.length > 0 || runtimeCycles.length > 0) {
    const detail = {}

    let errMsg = "Circular dependencies detected."

    if (buildCycles.length > 0) {
      const buildCyclesDescription = cyclesToString(buildCycles)
      errMsg = errMsg.concat("\n\n" + dedent`
        Circular build dependencies: ${buildCyclesDescription}
      `)
      detail["circular-build-dependencies"] = buildCyclesDescription
    }

    if (runtimeCycles.length > 0) {
      const runtimeCyclesDescription = cyclesToString(runtimeCycles)
      errMsg = errMsg.concat("\n\n" + dedent`
        Circular service/task dependencies: ${runtimeCyclesDescription}
      `)
      detail["circular-service-or-task-dependencies"] = runtimeCyclesDescription
    }

    throw new ConfigurationError(errMsg, detail)
  }
}

export function detectCycles(graph, vertices: string[]): Cycle[] {
  // Compute shortest paths
  for (const k of vertices) {
    for (const i of vertices) {
      for (const j of vertices) {
        const distanceViaK: number = distance(graph, i, k) + distance(graph, k, j)
        if (distanceViaK < distance(graph, i, j)) {
          const nextViaK = next(graph, i, k)
          set(graph, [i, j], { distance: distanceViaK, next: nextViaK })
        }
      }
    }
  }

  // Reconstruct cycles, if any
  const cycleVertices = vertices.filter(v => next(graph, v, v))
  const cycles: Cycle[] = cycleVertices.map(v => {
    const cycle = [v]
    let nextInCycle = next(graph, v, v)!
    while (nextInCycle !== v) {
      cycle.push(nextInCycle)
      nextInCycle = next(graph, nextInCycle, v)!
    }
    return cycle
  })

  return uniqWith(
    cycles, // The concat calls below are to prevent in-place sorting.
    (c1, c2) => isEqual(c1.concat().sort(), c2.concat().sort()))
}

function distance(graph, source, destination): number {
  return get(graph, [source, destination, "distance"], Infinity)
}

function next(graph, source, destination): string | undefined {
  return get(graph, [source, destination, "next"])
}

function cyclesToString(cycles: Cycle[]) {
  const cycleDescriptions = cycles.map(c => join(c.concat([c[0]]), " <- "))
  return cycleDescriptions.length === 1 ? cycleDescriptions[0] : cycleDescriptions
}
