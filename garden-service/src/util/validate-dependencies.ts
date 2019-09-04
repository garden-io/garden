/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { merge, flatten, uniq } from "lodash"
import indentString from "indent-string"
import { get, isEqual, join, set, uniqWith } from "lodash"
import { getModuleKey } from "../types/module"
import { ConfigurationError } from "../exceptions"
import { ServiceConfig } from "../config/service"
import { TaskConfig } from "../config/task"
import { ModuleConfig } from "../config/module"
import { deline } from "./string"

export function validateDependencies(moduleConfigs: ModuleConfig[], serviceNames: string[], taskNames: string[]): void {
  const missingDepsError = detectMissingDependencies(moduleConfigs, serviceNames, taskNames)
  const circularDepsError = detectCircularModuleDependencies(moduleConfigs)

  let errMsg = ""
  let detail = {}

  if (missingDepsError) {
    errMsg += missingDepsError.message
    detail = merge(detail, missingDepsError.detail)
  }

  if (circularDepsError) {
    errMsg += "\n" + circularDepsError.message
    detail = merge(detail, circularDepsError.detail)
  }

  if (missingDepsError || circularDepsError) {
    throw new ConfigurationError(errMsg, detail)
  }
}

/**
 * Looks for dependencies on non-existent modules, services or tasks, and returns an error
 * if any were found.
 */
export function detectMissingDependencies(
  moduleConfigs: ModuleConfig[],
  serviceNames: string[],
  taskNames: string[]
): ConfigurationError | null {
  const moduleNames: Set<string> = new Set(moduleConfigs.map((m) => m.name))
  const runtimeNames: Set<string> = new Set([...serviceNames, ...taskNames])
  const missingDepDescriptions: string[] = []

  const runtimeDepTypes = [["serviceConfigs", "Service"], ["taskConfigs", "Task"], ["testConfigs", "Test"]]

  for (const m of moduleConfigs) {
    const buildDepKeys = m.build.dependencies.map((d) => getModuleKey(d.name, d.plugin))

    for (const missingModule of buildDepKeys.filter((k) => !moduleNames.has(k))) {
      missingDepDescriptions.push(
        `Module '${m.name}': Unknown module '${missingModule}' referenced in build dependencies.`
      )
    }

    for (const [configKey, entityName] of runtimeDepTypes) {
      for (const config of m[configKey]) {
        for (const missingRuntimeDep of config.dependencies.filter((d) => !runtimeNames.has(d))) {
          missingDepDescriptions.push(deline`
            ${entityName} '${config.name}' (in module '${m.name}'): Unknown service or task '${missingRuntimeDep}'
            referenced in dependencies.`)
        }
      }
    }
  }

  if (missingDepDescriptions.length > 0) {
    const errMsg = "Unknown dependencies detected.\n\n" + indentString(missingDepDescriptions.join("\n\n"), 2) + "\n"

    return new ConfigurationError(errMsg, {
      unknownDependencies: missingDepDescriptions,
      availableModules: Array.from(moduleNames),
      availableServicesAndTasks: Array.from(runtimeNames),
    })
  } else {
    return null
  }
}

export type Cycle = string[]

/**
 * Computes build and runtime dependency graphs for the given modules, and returns an error if cycles were found.
 */
export function detectCircularModuleDependencies(moduleConfigs: ModuleConfig[]): ConfigurationError | null {
  // Sparse matrices
  const buildDeps: Dependency[] = []
  const runtimeDeps: Dependency[] = []
  const services: ServiceConfig[] = []
  const tasks: TaskConfig[] = []

  /**
   * Since dependencies listed in test configs cannot introduce circularities (because
   * builds/deployments/tasks/tests cannot currently depend on tesxts), we don't need to
   * account for test dependencies here.
   */
  for (const module of moduleConfigs) {
    // Build dependencies
    for (const buildDep of module.build.dependencies) {
      buildDeps.push({
        from: module.name,
        to: getModuleKey(buildDep.name, buildDep.plugin),
      })
    }

    // Runtime (service & task) dependencies
    for (const service of module.serviceConfigs || []) {
      services.push(service)
      for (const depName of service.dependencies) {
        runtimeDeps.push({
          from: service.name,
          to: depName,
        })
      }
    }

    for (const task of module.taskConfigs || []) {
      tasks.push(task)
      for (const depName of task.dependencies) {
        runtimeDeps.push({
          from: task.name,
          to: depName,
        })
      }
    }
  }

  const buildCycles = detectCycles(buildDeps)
  const runtimeCycles = detectCycles(runtimeDeps)

  if (buildCycles.length > 0 || runtimeCycles.length > 0) {
    const detail = {}

    let errMsg = "Circular dependencies detected."

    if (buildCycles.length > 0) {
      const buildCyclesDescription = cyclesToString(buildCycles)
      errMsg = errMsg.concat(
        "\n\n" +
          dedent`
        Circular build dependencies: ${buildCyclesDescription}
      `
      )
      detail["circular-build-dependencies"] = buildCyclesDescription
    }

    if (runtimeCycles.length > 0) {
      const runtimeCyclesDescription = cyclesToString(runtimeCycles)
      errMsg = errMsg.concat(
        "\n\n" +
          dedent`
        Circular service/task dependencies: ${runtimeCyclesDescription}
      `
      )
      detail["circular-service-or-task-dependencies"] = runtimeCyclesDescription
    }

    return new ConfigurationError(errMsg, detail)
  }

  return null
}

// These types are used for our own dependency graph code, which we should likely deprecate
export interface Dependency {
  from: string
  to: string
}

interface _DependencyGraph {
  [key: string]: {
    [target: string]: {
      distance: number
      next: string
    }
  }
}

/**
 * Implements a variation on the Floyd-Warshall algorithm to compute minimal cycles.
 *
 * This is approximately O(m^3) + O(s^3), where m is the number of modules and s is the number of services.
 *
 * Returns a list of cycles found.
 */
export function detectCycles(dependencies: Dependency[]): Cycle[] {
  // Collect all the vertices and build a graph object
  const vertices = uniq(flatten(dependencies.map((d) => [d.from, d.to])))

  const graph: _DependencyGraph = {}

  for (const { from, to } of dependencies) {
    set(graph, [from, to], { distance: 1, next: to })
  }

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
  const cycleVertices = vertices.filter((v) => next(graph, v, v))
  const cycles: Cycle[] = cycleVertices.map((v) => {
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
    (c1, c2) => isEqual(c1.concat().sort(), c2.concat().sort())
  )
}

function distance(graph: _DependencyGraph, source: string, destination: string): number {
  return get(graph, [source, destination, "distance"], Infinity) as number
}

function next(graph: _DependencyGraph, source: string, destination: string): string | undefined {
  return get(graph, [source, destination, "next"])
}

export function cyclesToString(cycles: Cycle[]) {
  const cycleDescriptions = cycles.map((c) => join(c.concat([c[0]]), " <- "))
  return cycleDescriptions.length === 1 ? cycleDescriptions[0] : cycleDescriptions
}
