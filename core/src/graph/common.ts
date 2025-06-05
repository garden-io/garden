/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DepGraph } from "dependency-graph"
import { flatten, uniq } from "lodash-es"
import { get, isEqual, join, set, uniqWith } from "lodash-es"
import { CircularDependenciesError } from "../exceptions.js"
import type { GraphNodes, ConfigGraphNode } from "./config-graph.js"
import { Profile } from "../util/profiling.js"
import type { ModuleDependencyGraphNode, ModuleDependencyGraphNodeKind, ModuleGraphNodes } from "./modules.js"
import type { ActionKind } from "../plugin/action-types.js"
import type { Task } from "../tasks/base.js"
import type { LogMetadata, TaskLogStatus } from "../logger/log-entry.js"

// Shared type used by ConfigGraph and TaskGraph to facilitate circular dependency detection
export type DependencyGraphNode = {
  key: string // same as a corresponding task's key
  dependencies: string[] // array of keys
  description?: string // used instead of key when rendering node in circular dependency error messages
}

/**
 * Extends the dependency-graph module to improve circular dependency detection (see below).
 */
@Profile()
export class DependencyGraph<T> extends DepGraph<T> {
  static fromGraphNodes<G extends GraphNodes | ModuleGraphNodes>(dependencyGraph: G) {
    const withDeps = (node: ConfigGraphNode | ModuleDependencyGraphNode): DependencyGraphNode => {
      return {
        key: nodeKey(node.kind, node.name),
        dependencies: node.dependencies.map((d) => nodeKey(d.kind, d.name)),
      }
    }

    const graph = new DependencyGraph<string>()
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

  override overallOrder(leavesOnly?: boolean): string[] {
    try {
      return super.overallOrder(leavesOnly)
    } catch {
      // TODO: catching everything here is a code smell. We should narrow the error type instead.
      const cycles = this.detectMinimalCircularDependencies()
      const cyclesSummary = cyclesToString(cycles)
      throw new CircularDependenciesError({
        messagePrefix: "Circular dependencies detected",
        cycles,
        cyclesSummary,
      })
    }
  }

  keys() {
    return Object.keys(this["nodes"])
  }

  /**
   * Returns a clone of the graph.
   * Overriding base implementation to retain the same class type.
   */
  override clone() {
    const result = new DependencyGraph<T>()
    const keys = Object.keys(this["nodes"])
    for (const n of keys) {
      result["nodes"][n] = this["nodes"][n]
      result["outgoingEdges"][n] = [...this["outgoingEdges"][n]]
      result["incomingEdges"][n] = [...this["incomingEdges"][n]]
    }
    return result
  }

  /**
   * Returns an error if cycles were found.
   */
  detectCircularDependencies(): Cycle[] {
    try {
      super.overallOrder(true)
      return []
    } catch {
      return this.detectMinimalCircularDependencies()
    }
  }

  /**
   * Computes minimal cycles for the graph. This is more expensive than the above method, so it should be used rarely.
   */
  detectMinimalCircularDependencies(): Cycle[] {
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

export type Cycle = string[]

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

export function nodeKey(type: ActionKind | ModuleDependencyGraphNodeKind, name: string) {
  return `${type}.${name}`
}

/// make the params an object
export function metadataForLog({
  task,
  status,
  inputVersion,
  outputVersion,
}: {
  task: Task
  status: TaskLogStatus
  inputVersion: string | null
  outputVersion?: string
}): LogMetadata {
  return {
    task: {
      type: task.type,
      key: task.getKey(),
      status,
      uid: task.uid,
      inputVersion,
      outputVersion,
    },
  }
}
