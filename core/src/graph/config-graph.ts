/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import toposort from "toposort"
import { flatten, difference, mapValues, cloneDeep } from "lodash"
import { GardenBaseError } from "../exceptions"
import { naturalList } from "../util/string"
import {
  Action,
  ActionDependencyType,
  ActionKind,
  actionReferenceToString,
  Resolved,
  ResolvedAction,
} from "../actions/base"
import { BuildAction } from "../actions/build"
import { ActionReference, parseActionReference } from "../config/common"
import { GardenModule } from "../types/module"
import { GetManyParams, ModuleGraph } from "./modules"
import { getNames } from "../util/util"
import { nodeKey } from "./common"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"

export type DependencyRelationFilterFn = (node: ConfigGraphNode) => boolean

// Output types for rendering/logging
export type RenderedActionGraph = {
  nodes: RenderedNode[]
  relationships: RenderedEdge[]
}
export type RenderedEdge = { dependant: RenderedNode; dependency: RenderedNode }

export interface RenderedNode {
  kind: ActionKind
  name: string
  moduleName?: string
  key: string
  disabled: boolean
}

export type GraphNodes = { [key: string]: ConfigGraphNode }

interface GetActionOpts {
  includeDisabled?: boolean
  ignoreMissing?: boolean
}

interface GetActionsParams extends GetActionOpts {
  names?: string[]
}

export class GraphError extends GardenBaseError {
  type = "graph"
}

type PickTypeByKind<
  K extends ActionKind,
  B extends BuildAction,
  D extends DeployAction,
  R extends RunAction,
  T extends TestAction
> = K extends "Build" ? B : K extends "Deploy" ? D : K extends "Run" ? R : T

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 *
 * This should be initialized with resolved and validated GardenModules.
 */
export abstract class BaseConfigGraph<
  A extends Action,
  B extends BuildAction,
  D extends DeployAction,
  R extends RunAction,
  T extends TestAction
> {
  protected dependencyGraph: GraphNodes

  protected actions: {
    Build: { [key: string]: B }
    Deploy: { [key: string]: D }
    Run: { [key: string]: R }
    Test: { [key: string]: T }
  }

  readonly moduleGraph: ModuleGraph

  constructor({ actions, moduleGraph }: { actions: Action[]; moduleGraph: ModuleGraph }) {
    this.dependencyGraph = {}
    this.actions = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }
    this.moduleGraph = moduleGraph

    for (const action of actions) {
      this.addActionInternal(action)
    }

    this.validate()
  }

  validate() {
    // TODO-G2
  }

  clone() {
    const clone = new ConfigGraph({ actions: [], moduleGraph: this.moduleGraph })
    for (const key of Object.getOwnPropertyNames(this)) {
      clone[key] = cloneDeep(this[key])
    }
    return clone
  }

  /////////////////
  // For compatibility
  getModule(name: string, includeDisabled?: boolean) {
    return this.moduleGraph.getModule(name, includeDisabled)
  }
  getModules(params: GetManyParams = {}) {
    return this.moduleGraph.getModules(params)
  }
  withDependantModules(modules: GardenModule[]) {
    return this.moduleGraph.withDependantModules(modules)
  }
  // and sanity...
  //////////////////

  getActions({ refs }: { refs?: ActionReference[] } = {}): A[] {
    // TODO: maybe we can optimize this one :P
    const all = flatten(Object.values(this.actions).map((a) => Object.values(a)))
    if (refs) {
      const stringRefs = refs.map(actionReferenceToString)
      return all.filter((a) => stringRefs.includes(a.stringReference()))
    } else {
      return all
    }
  }

  getActionByRef(refOrString: ActionReference | string): A {
    const ref = parseActionReference(refOrString)
    return <A>(<unknown>this.getActionByKind(ref.kind, ref.name))
  }

  getActionByKind<K extends ActionKind>(
    kind: K,
    name: string,
    opts: GetActionOpts = {}
  ): PickTypeByKind<K, B, D, R, T> {
    const action = this.actions[kind][name]

    if (!action) {
      throw new GraphError(`Could not find ${kind} action ${name}.`, {
        available: this.getNamesByKind(),
      })
    }

    if (action.isDisabled() && !opts.includeDisabled) {
      throw new GraphError(`${action.longDescription()} is disabled.`, {
        config: action.getConfig(),
      })
    }

    return <PickTypeByKind<K, B, D, R, T>>action
  }

  getNamesByKind() {
    return mapValues(this.actions, (byKind) => getNames(Object.values(byKind)))
  }

  getActionsByKind<K extends ActionKind>(
    kind: K,
    { names, includeDisabled = false, ignoreMissing = false }: GetActionsParams = {}
  ): PickTypeByKind<K, B, D, R, T>[] {
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

  getBuild(name: string, opts?: GetActionOpts): B {
    return this.getActionByKind("Build", name, opts)
  }

  getDeploy(name: string, opts?: GetActionOpts): D {
    return this.getActionByKind("Deploy", name, opts)
  }

  getRun(name: string, opts?: GetActionOpts): R {
    return this.getActionByKind("Run", name, opts)
  }

  getTest(name: string, opts?: GetActionOpts): T {
    return this.getActionByKind("Test", name, opts)
  }

  getBuilds(params: GetActionsParams = {}): B[] {
    return this.getActionsByKind("Build", params)
  }

  getDeploys(params: GetActionsParams = {}): D[] {
    return this.getActionsByKind("Deploy", params)
  }

  getRuns(params: GetActionsParams = {}): R[] {
    return this.getActionsByKind("Run", params)
  }

  getTests(params: GetActionsParams = {}): T[] {
    return this.getActionsByKind("Test", params)
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
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(this.getDependencyNodes({ kind, name, recursive, filter }))
  }

  /**
   * Returns all dependants of a node in the graph.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  getDependants({
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(this.getDependantNodes({ kind, name, recursive, filter }))
  }

  /**
   * Same as getDependencies above, but returns the set union of the dependencies of the nodes in the graph
   * having type = kind and name = name (computed recursively or shallowly for all).
   */
  getDependenciesForMany({
    refs,
    recursive,
    filter,
  }: {
    refs: ActionReference[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    return this.nodesToActions(
      flatten(refs.map((ref) => this.getDependencyNodes({ kind: ref.kind, name: ref.name, recursive, filter })))
    )
  }

  /**
   * Same as getDependants above, but returns the set union of the dependants of the nodes in the graph
   * having type = kind and name = name (computed recursively or shallowly for all).
   */
  getDependantsForMany({
    kind,
    names,
    recursive,
    filter,
  }: {
    kind: ActionKind
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }) {
    const nodes = flatten(names.map((name) => this.getDependantNodes({ kind, name, recursive, filter })))
    return this.nodesToActions(nodes)
  }

  private getDependencyNodes({
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): ConfigGraphNode[] {
    const node = this.dependencyGraph[nodeKey(kind, name)]
    return node ? node.getDependencies(recursive, filter) : []
  }

  private getDependantNodes({
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ActionKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): ConfigGraphNode[] {
    const node = this.dependencyGraph[nodeKey(kind, name)]
    return node ? node.getDependants(recursive, filter) : []
  }

  private nodesToActions(nodes: ConfigGraphNode[]) {
    return nodes.map((n) => this.actions[n.type][n.name])
  }

  // private uniqueNames(nodes: ConfigGraphNode[], type: ActionKind) {
  //   return uniq(nodes.filter((n) => n.type === type).map((n) => n.name))
  // }

  render(): RenderedActionGraph {
    const nodes = Object.values(this.dependencyGraph)
    let edges: ConfigGraphEdge[] = []
    let simpleEdges: string[][] = []
    for (const dependant of nodes) {
      for (const dependency of dependant.dependencies) {
        edges.push({ dependant, dependency })
        simpleEdges.push([nodeKey(dependant.type, dependant.name), nodeKey(dependency.type, dependency.name)])
      }
    }

    const sortedNodeKeys = toposort(simpleEdges)

    const edgeSortIndex = (e: ConfigGraphEdge) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(e.dependency.type, e.dependency.name))
    }
    edges = edges.sort((e1, e2) => edgeSortIndex(e2) - edgeSortIndex(e1))
    const renderedEdges = edges.map((e) => ({
      dependant: e.dependant.render(),
      dependency: e.dependency.render(),
    }))

    const nodeSortIndex = (n: ConfigGraphNode) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(n.type, n.name))
    }
    const renderedNodes = nodes.sort((n1, n2) => nodeSortIndex(n2) - nodeSortIndex(n1)).map((n) => n.render())

    return {
      relationships: renderedEdges,
      nodes: renderedNodes,
    }
  }

  protected addActionInternal(action: Action) {
    const node = this.getNode(action.kind, action.name, action.isDisabled())

    for (const dep of action.getDependencyReferences()) {
      this.addRelation({
        dependant: node,
        dependencyKind: dep.kind,
        dependencyName: dep.name,
      })
    }
  }

  // Idempotent.
  protected getNode(kind: ActionKind, name: string, disabled: boolean) {
    const key = nodeKey(kind, name)
    const existingNode = this.dependencyGraph[key]
    if (existingNode) {
      if (disabled) {
        existingNode.disabled = true
      }
      return existingNode
    } else {
      const newNode = new ConfigGraphNode(kind, name, disabled)
      this.dependencyGraph[key] = newNode
      return newNode
    }
  }

  // Idempotent.
  protected addRelation({
    dependant,
    dependencyKind,
    dependencyName,
  }: {
    dependant: ConfigGraphNode
    dependencyKind: ActionKind
    dependencyName: string
  }) {
    const dependency = this.getNode(dependencyKind, dependencyName, false)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }
}

export class ConfigGraph extends BaseConfigGraph<Action, BuildAction, DeployAction, RunAction, TestAction> {}
export class ResolvedConfigGraph extends BaseConfigGraph<
  ResolvedAction,
  Resolved<BuildAction>,
  Resolved<DeployAction>,
  Resolved<RunAction>,
  Resolved<TestAction>
> {}

export class MutableConfigGraph extends ConfigGraph {
  addAction(action: Action) {
    this.addActionInternal(action)
  }

  addDependency(by: ActionReference | string, on: ActionReference | string, type: ActionDependencyType) {
    const dependant = this.getActionByRef(by)
    const dependency = this.getActionByRef(on)

    dependant.addDependency({ ...dependency, type })

    this.addRelation({
      dependant: this.getNode(dependant.kind, dependant.name, dependant.isDisabled()),
      dependencyKind: dependency.kind,
      dependencyName: dependency.name,
    })
  }

  toConfigGraph() {
    return this.clone()
  }
}

export interface ConfigGraphEdge {
  dependant: ConfigGraphNode
  dependency: ConfigGraphNode
}

export class ConfigGraphNode {
  dependencies: ConfigGraphNode[]
  dependants: ConfigGraphNode[]

  constructor(public type: ActionKind, public name: string, public disabled: boolean) {
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    return {
      name: this.name,
      kind: this.type,
      key: this.name,
      disabled: this.disabled,
    }
  }

  // Idempotent.
  addDependency(node: ConfigGraphNode) {
    const key = nodeKey(node.type, node.name)
    if (!this.dependencies.find((d) => nodeKey(d.type, d.name) === key)) {
      this.dependencies.push(node)
    }
  }

  // Idempotent.
  addDependant(node: ConfigGraphNode) {
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
      if (n.type !== "Build" && n.disabled) {
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
