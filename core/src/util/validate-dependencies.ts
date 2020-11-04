/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DepGraph } from "dependency-graph"
import { flatten, uniq } from "lodash"
import indentString from "indent-string"
import { get, isEqual, join, set, uniqWith } from "lodash"
import { getModuleKey } from "../types/module"
import { ConfigurationError } from "../exceptions"
import { ModuleConfig } from "../config/module"
import { deline } from "./string"
import { DependencyGraph, DependencyGraphNode, nodeKey as configGraphNodeKey } from "../config-graph"
import { Profile } from "./profiling"

/**
 * Looks for dependencies on non-existent modules, services or tasks, and throws a ConfigurationError
 * if any were found.
 */
export function detectMissingDependencies(moduleConfigs: ModuleConfig[]) {
  const moduleNames: Set<string> = new Set(moduleConfigs.map((m) => m.name))
  const serviceNames = moduleConfigs.flatMap((m) => m.serviceConfigs.map((s) => s.name))
  const taskNames = moduleConfigs.flatMap((m) => m.taskConfigs.map((t) => t.name))
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

    throw new ConfigurationError(errMsg, {
      unknownDependencies: missingDepDescriptions,
      availableModules: Array.from(moduleNames),
      availableServicesAndTasks: Array.from(runtimeNames),
    })
  }
}

// Shared type used by ConfigGraph and TaskGraph to facilitate circular dependency detection
export type DependencyValidationGraphNode = {
  key: string // same as a corresponding task's key
  dependencies: string[] // array of keys
  description?: string // used instead of key when rendering node in circular dependency error messages
}

/**
 * Extends the dependency-graph module to improve circular dependency detection (see below).
 */
@Profile()
export class DependencyValidationGraph extends DepGraph<string> {
  static fromDependencyGraph(dependencyGraph: DependencyGraph) {
    const withDeps = (node: DependencyGraphNode): DependencyValidationGraphNode => {
      return {
        key: configGraphNodeKey(node.type, node.name),
        dependencies: node.dependencies.map((d) => configGraphNodeKey(d.type, d.name)),
      }
    }

    const graph = new DependencyValidationGraph()
    const nodes = Object.values(dependencyGraph).map((n) => withDeps(n))

    for (const node of nodes || []) {
      graph.addNode(node.key, node.description)
    }
    for (const node of nodes || []) {
      for (const dep of node.dependencies) {
        graph.addDependency(node.key, dep)
      }
    }

    return graph
  }

  overallOrder(leavesOnly?: boolean): string[] {
    const cycles = this.detectCircularDependencies()
    if (cycles.length > 0) {
      const description = cyclesToString(cycles)
      const errMsg = `\nCircular dependencies detected: \n\n${description}\n`
      throw new ConfigurationError(errMsg, { "circular-dependencies": description, cycles })
    }

    return super.overallOrder(leavesOnly)
  }

  /**
   * Returns an error if cycles were found.
   */
  detectCircularDependencies(): Cycle[] {
    const edges: DependencyEdge[] = []

    for (const [node, deps] of Object.entries(this["outgoingEdges"])) {
      for (const dep of <any>deps) {
        edges.push({ from: node, to: dep })
      }
    }

    return detectCycles(edges)
  }

  cyclesToString(cycles: Cycle[]) {
    const cycleDescriptions = cycles.map((c) => {
      const nodeDescriptions = c.map((key) => this["nodes"][key] || key)
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
