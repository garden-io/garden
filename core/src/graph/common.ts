/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DepGraph } from "dependency-graph"
import { flatten, merge, uniq } from "lodash"
import { get, isEqual, join, set, uniqWith } from "lodash"
import { ConfigurationError } from "../exceptions"
import { GraphNodes, ConfigGraphNode } from "./config-graph"
import { Profile } from "../util/profiling"
import type { ModuleGraphNodes } from "./modules"
import { ActionKind } from "../plugin/action-types"
import Bluebird from "bluebird"
import { loadVarfile } from "../config/base"
import { DeepPrimitiveMap } from "../config/common"

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
    const withDeps = (node: ConfigGraphNode): DependencyGraphNode => {
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

  overallOrder(leavesOnly?: boolean): string[] {
    try {
      return super.overallOrder(leavesOnly)
    } catch {
      const cycles = this.detectMinimalCircularDependencies()
      const description = cyclesToString(cycles)
      const errMsg = `\nCircular dependencies detected: \n\n${description}\n`
      throw new ConfigurationError(errMsg, { "circular-dependencies": description, cycles })
    }
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

export async function resolveVariables({
  basePath,
  variables,
  varfiles,
}: {
  basePath: string
  variables?: DeepPrimitiveMap
  varfiles?: string[]
}) {
  const varsByFile = await Bluebird.map(varfiles || [], (path) => {
    return loadVarfile({
      configRoot: basePath,
      path,
      defaultPath: undefined,
    })
  })

  const output: DeepPrimitiveMap = {}

  // Merge different varfiles, later files taking precedence over prior files in the list.
  // TODO-G2: should we change precedence order here?
  // TODO-G2: should this be a JSON merge?
  for (const vars of varsByFile) {
    merge(output, vars)
  }

  if (variables) {
    merge(output, variables)
  }

  return output
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

export function nodeKey(type: ActionKind, name: string) {
  return `${type}.${name}`
}
