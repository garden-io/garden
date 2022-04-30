/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import toposort from "toposort"
import { flatten, uniq, difference } from "lodash"
import { GardenBaseError } from "../exceptions"
import { naturalList } from "../util/string"
import { Action, ActionKind, ResolvedAction, ResolvedRuntimeAction } from "../actions/base"
import { BuildAction, ResolvedBuildAction } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { ActionReference } from "../config/common"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"

export type DependencyRelationFilterFn = (node: DependencyGraphNode) => boolean

// Output types for rendering/logging
export type RenderedActionGraph = {
  nodes: RenderedNode[]
  relationships: RenderedEdge[]
}
export type RenderedEdge = { dependant: RenderedNode; dependency: RenderedNode }

export interface RenderedNode {
  type: ActionKind
  name: string
  moduleName?: string
  key: string
  disabled: boolean
}

export type DependencyGraph = { [key: string]: DependencyGraphNode }

interface ResolvedActionTypeMap {
  build: ResolvedBuildAction<any>
  deploy: ResolvedRuntimeAction<any>
  run: ResolvedRuntimeAction<any>
  test: ResolvedRuntimeAction<any>
}

interface GetActionsParams {
  names?: string[]
  includeDisabled?: boolean
  ignoreMissing?: boolean
}

export class GraphError extends GardenBaseError {
  type = "graph"
}

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 *
 * This should be initialized with resolved and validated GardenModules.
 */
// TODO-G2: re-do for actions
export class ConfigGraph {
  protected dependencyGraph: DependencyGraph

  protected actions: {
    build: { [key: string]: ResolvedBuildAction<any> }
    deploy: { [key: string]: ResolvedRuntimeAction<any> }
    run: { [key: string]: ResolvedRuntimeAction<any> }
    test: { [key: string]: ResolvedRuntimeAction<any> }
  }

  constructor() {
    this.dependencyGraph = {}
    this.actions = {
      build: {},
      deploy: {},
      run: {},
      test: {},
    }
  }

  validate() {
    // TODO-G2
  }

  getActionByRef<T extends Action = Action>(ref: ActionReference): ResolvedAction<T> {
    return this.getActionByKind(ref.kind, ref.name)
  }

  getActionByKind<K extends ActionKind>(kind: K, name: string): ResolvedActionTypeMap[K] {
    return <ResolvedActionTypeMap[K]>this.actions[kind][name]
  }

  getActionsByKind<K extends ActionKind>(
    kind: K,
    { names, includeDisabled = false, ignoreMissing = false }: GetActionsParams = {}
  ): ResolvedActionTypeMap[K][] {
    const foundNames: string[] = []

    const found = Object.values(this.actions[kind]).filter((a) => {
      if (a.isDisabled() && !includeDisabled) {
        return false
      }
      if (names) {
        foundNames.push(a.name)
        if (!names.includes(a.name)) {
          return false
        }
      }
      return true
    })

    if (!ignoreMissing && names && names.length > found.length) {
      const missing = difference(names, foundNames)

      throw new GraphError(`Could not find one or more ${kind} actions: ${naturalList(missing)}`, {
        names,
        missing,
      })
    }

    return found
  }

  getBuild<T extends BuildAction = BuildAction>(name: string): ResolvedBuildAction<T> {
    return this.getActionByKind("build", name)
  }

  getDeploy<T extends DeployAction = DeployAction>(name: string): ResolvedRuntimeAction<T> {
    return this.getActionByKind("deploy", name)
  }

  getRun<T extends RunAction = RunAction>(name: string): ResolvedRuntimeAction<T> {
    return this.getActionByKind("run", name)
  }

  getTest<T extends TestAction = TestAction>(name: string): ResolvedRuntimeAction<T> {
    return this.getActionByKind("test", name)
  }

  getBuilds<T extends BuildAction = BuildAction>(params: GetActionsParams = {}): ResolvedBuildAction<T>[] {
    return this.getActionsByKind("build", params)
  }

  getDeploys<T extends DeployAction = DeployAction>(params: GetActionsParams = {}): ResolvedRuntimeAction<T>[] {
    return this.getActionsByKind("deploy", params)
  }

  getRuns<T extends RunAction = RunAction>(params: GetActionsParams = {}): ResolvedRuntimeAction<T>[] {
    return this.getActionsByKind("run", params)
  }

  getTests<T extends TestAction = TestAction>(params: GetActionsParams = {}): ResolvedRuntimeAction<T>[] {
    return this.getActionsByKind("test", params)
  }

  /*
   * If filter is provided to any of the methods below that accept it, matching nodes
   * (and their dependencies/dependants, if recursive = true) are ignored.
   */
  /**
   * Returns all dependencies of a node in the graph. As noted above, each ActionKind corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependencies' dependencies, etc.
   */
  getDependencies({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(this.getDependencyNodes({ nodeType, name, recursive, filter }))
  }

  /**
   * Returns all dependants of a node in the graph.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  getDependants({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(this.getDependantNodes({ nodeType, name, recursive, filter }))
  }

  /**
   * Same as getDependencies above, but returns the set union of the dependencies of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  getDependenciesForMany({
    nodeType,
    names,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(
      flatten(names.map((name) => this.getDependencyNodes({ nodeType, name, recursive, filter })))
    )
  }

  /**
   * Same as getDependants above, but returns the set union of the dependants of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  getDependantsForMany({
    nodeType,
    names,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    const nodes = flatten(names.map((name) => this.getDependantNodes({ nodeType, name, recursive, filter })))
    return this.nodesToActions(nodes)
  }

  private getDependencyNodes({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(nodeType, name)]
    return node ? node.getDependencies(recursive, filter) : []
  }

  private getDependantNodes({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(nodeType, name)]
    return node ? node.getDependants(recursive, filter) : []
  }

  private nodesToActions(nodes: DependencyGraphNode[]) {
    return nodes.map((n) => this.actions[n.type][n.name])
  }

  private uniqueNames(nodes: DependencyGraphNode[], type: ActionKind) {
    return uniq(nodes.filter((n) => n.type === type).map((n) => n.name))
  }

  render(): RenderedActionGraph {
    const nodes = Object.values(this.dependencyGraph)
    let edges: DependencyGraphEdge[] = []
    let simpleEdges: string[][] = []
    for (const dependant of nodes) {
      for (const dependency of dependant.dependencies) {
        edges.push({ dependant, dependency })
        simpleEdges.push([nodeKey(dependant.type, dependant.name), nodeKey(dependency.type, dependency.name)])
      }
    }

    const sortedNodeKeys = toposort(simpleEdges)

    const edgeSortIndex = (e) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(e.dependency.type, e.dependency.name))
    }
    edges = edges.sort((e1, e2) => edgeSortIndex(e2) - edgeSortIndex(e1))
    const renderedEdges = edges.map((e) => ({
      dependant: e.dependant.render(),
      dependency: e.dependency.render(),
    }))

    const nodeSortIndex = (n: DependencyGraphNode) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(n.type, n.name))
    }
    const renderedNodes = nodes.sort((n1, n2) => nodeSortIndex(n2) - nodeSortIndex(n1)).map((n) => n.render())

    return {
      relationships: renderedEdges,
      nodes: renderedNodes,
    }
  }
}

export class MutableConfigGraph extends ConfigGraph {
  addAction(action: ResolvedAction<any>) {}

  // Idempotent.
  private getNode(type: ActionKind, name: string, moduleName: string, disabled: boolean) {
    const key = nodeKey(type, name)
    const existingNode = this.dependencyGraph[key]
    if (existingNode) {
      if (disabled) {
        existingNode.disabled = true
      }
      return existingNode
    } else {
      const newNode = new DependencyGraphNode(type, name, moduleName, disabled)
      this.dependencyGraph[key] = newNode
      return newNode
    }
  }

  // Idempotent.
  private addRelation({
    dependant,
    dependencyType,
    dependencyName,
    dependencyModuleName,
  }: {
    dependant: DependencyGraphNode
    dependencyType: ActionKind
    dependencyName: string
    dependencyModuleName: string
  }) {
    const dependency = this.getNode(dependencyType, dependencyName, dependencyModuleName, false)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }

}

export interface DependencyGraphEdge {
  dependant: DependencyGraphNode
  dependency: DependencyGraphNode
}

export class DependencyGraphNode {
  dependencies: DependencyGraphNode[]
  dependants: DependencyGraphNode[]

  constructor(
    public type: ActionKind,
    public name: string,
    public moduleName: string | undefined,
    public disabled: boolean
  ) {
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    return {
      name: this.name,
      type: this.type,
      moduleName: this.moduleName,
      key: this.name,
      disabled: this.disabled,
    }
  }

  // Idempotent.
  addDependency(node: DependencyGraphNode) {
    const key = nodeKey(node.type, node.name)
    if (!this.dependencies.find((d) => nodeKey(d.type, d.name) === key)) {
      this.dependencies.push(node)
    }
  }

  // Idempotent.
  addDependant(node: DependencyGraphNode) {
    const key = nodeKey(node.type, node.name)
    if (!this.dependants.find((d) => nodeKey(d.type, d.name) === key)) {
      this.dependants.push(node)
    }
  }

  /**
   * Returns the dependencies of this node, optionally recursively.
   * Omits disabled dependency nodes other than build dependencies, and does not recurse past them.
   * If filter is provided, ignores matching nodes and their dependencies.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  getDependencies(recursive: boolean, filter?: DependencyRelationFilterFn) {
    return this.traverse("dependencies", recursive, filter)
  }

  /**
   * Returns the dependants of this node, optionally recursively.
   * Omits disabled dependant nodes other than build dependants, and does not recurse past them.
   * If filter is provided, ignores matching nodes and their dependants.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  getDependants(recursive: boolean, filter?: DependencyRelationFilterFn) {
    return this.traverse("dependants", recursive, filter)
  }

  private traverse(type: "dependants" | "dependencies", recursive: boolean, filter?: DependencyRelationFilterFn) {
    const nodes = this[type].filter((n) => {
      if (n.type !== "build" && n.disabled) {
        return false
      } else if (filter) {
        return filter(n)
      } else {
        return true
      }
    })

    if (recursive) {
      return flatten(nodes.concat(nodes.map((d) => d.traverse(type, recursive, filter))))
    } else {
      return nodes
    }
  }
}

export function nodeKey(type: ActionKind, name: string) {
  return `${type}.${name}`
}
