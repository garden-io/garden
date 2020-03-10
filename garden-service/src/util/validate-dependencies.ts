/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DepGraph } from "dependency-graph"
import { merge, flatten, uniq } from "lodash"
import indentString from "indent-string"
import { get, isEqual, join, set, uniqWith } from "lodash"
import { getModuleKey } from "../types/module"
import { ConfigurationError, ParameterError } from "../exceptions"
import { ModuleConfig } from "../config/module"
import { deline } from "./string"
import { DependencyGraph, DependencyGraphNode, nodeKey as configGraphNodeKey } from "../config-graph"

export function handleDependencyErrors(
  missingDepsError: ConfigurationError | null,
  circularDepsError: ConfigurationError | null
) {
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

  const runtimeDepTypes = [
    ["serviceConfigs", "Service"],
    ["taskConfigs", "Task"],
    ["testConfigs", "Test"],
  ]

  for (const m of moduleConfigs) {
    const buildDepKeys = m.build.dependencies.map((d) => getModuleKey(d.name, d.plugin))

    for (const missingModule of buildDepKeys.filter((k) => !moduleNames.has(k))) {
      missingDepDescriptions.push(
        `Module '${m.name}': Unknown module '${missingModule}' referenced in build dependencies.`
      )
    }

    for (const [configKey, entityName] of runtimeDepTypes) {
      for (const config of m[configKey]) {
        for (const missingRuntimeDep of config.dependencies.filter((d: string) => !runtimeNames.has(d))) {
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

// Shared type used by ConfigGraph and TaskGraph to facilitate circular dependency detection
export type DependencyValidationGraphNode = {
  key: string // same as a corresponding task's key
  dependencies: string[] // array of keys
  description?: string // used instead of key when rendering node in circular dependency error messages
}

export class DependencyValidationGraph {
  graph: { [nodeKey: string]: DependencyValidationGraphNode }

  constructor(nodes?: DependencyValidationGraphNode[]) {
    this.graph = Object.fromEntries((nodes || []).map((n) => [n.key, n]))
  }

  static fromDependencyGraph(dependencyGraph: DependencyGraph) {
    const withDeps = (node: DependencyGraphNode): DependencyValidationGraphNode => {
      return {
        key: configGraphNodeKey(node.type, node.name),
        dependencies: node.dependencies.map((d) => configGraphNodeKey(d.type, d.name)),
      }
    }
    const nodes = Object.values(dependencyGraph).map((n) => withDeps(n))
    return new DependencyValidationGraph(nodes)
  }

  overallOrder(): string[] {
    const cycles = this.detectCircularDependencies()
    if (cycles.length > 0) {
      const description = cyclesToString(cycles)
      const errMsg = `\nCircular dependencies detected: \n\n${description}\n`
      throw new ConfigurationError(errMsg, { "circular-dependencies": description })
    }

    const depGraph = new DepGraph()
    for (const node of Object.values(this.graph)) {
      depGraph.addNode(node.key)
      for (const dep of node.dependencies) {
        depGraph.addNode(dep)
        depGraph.addDependency(node.key, dep)
      }
    }
    return depGraph.overallOrder()
  }

  /**
   * Idempotent.
   *
   * If provided, description will be used instead of key when rendering the node in
   * circular dependency error messages.
   */
  addNode(key: string, description?: string) {
    if (!this.graph[key]) {
      this.graph[key] = { key, dependencies: [], description }
    }
  }

  /**
   * Idempotent.
   *
   * Throws an error if a node doesn't exist for either dependantKey or dependencyKey.
   */
  addDependency(dependantKey: string, dependencyKey: string) {
    if (!this.graph[dependantKey]) {
      throw new ParameterError(`addDependency: no node exists for dependantKey ${dependantKey}`, {
        dependantKey,
        dependencyKey,
        graph: this.graph,
      })
    }

    if (!this.graph[dependencyKey]) {
      throw new ParameterError(`addDependency: no node exists for dependencyKey ${dependencyKey}`, {
        dependantKey,
        dependencyKey,
        graph: this.graph,
      })
    }

    const dependant = this.graph[dependantKey]
    if (!dependant.dependencies.find((d) => d === dependencyKey)) {
      const dependency = this.graph[dependencyKey]
      dependant.dependencies.push(dependency.key)
    }
  }

  /**
   * Returns an error if cycles were found.
   */
  detectCircularDependencies(): Cycle[] {
    const edges: DependencyEdge[] = []

    for (const node of Object.values(this.graph)) {
      for (const dep of node.dependencies) {
        edges.push({ from: node.key, to: dep })
      }
    }

    return detectCycles(edges)
  }

  cyclesToString(cycles: Cycle[]) {
    const cycleDescriptions = cycles.map((c) => {
      const nodeDescriptions = c.map((key) => this.graph[key].description || key)
      return join(nodeDescriptions.concat([nodeDescriptions[0]]), " <- ")
    })
    return cycleDescriptions.length === 1 ? cycleDescriptions[0] : cycleDescriptions.join("\n\n")
  }
}

type Cycle = string[]

interface DependencyEdge {
  from: string
  to: string
}

interface CycleGraph {
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
 * This is approximately O(n^3), where n is the number of nodes in the graph.
 *
 * Returns a list of cycles found.
 */
export function detectCycles(edges: DependencyEdge[]): Cycle[] {
  // Collect all the vertices and build a graph object
  const vertices = uniq(flatten(edges.map((d) => [d.from, d.to])))

  const graph: CycleGraph = {}

  for (const { from, to } of edges) {
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

function distance(graph: CycleGraph, source: string, destination: string): number {
  return get(graph, [source, destination, "distance"], Infinity) as number
}

function next(graph: CycleGraph, source: string, destination: string): string | undefined {
  return get(graph, [source, destination, "next"])
}

export function cyclesToString(cycles: Cycle[]) {
  const cycleDescriptions = cycles.map((c) => join(c.concat([c[0]]), " <- "))
  return cycleDescriptions.length === 1 ? cycleDescriptions[0] : cycleDescriptions.join("\n\n")
}
