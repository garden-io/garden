/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import toposort from "toposort"
import { flatten, difference, mapValues, find } from "lodash-es"
import { dedent, naturalList } from "../util/string.js"
import type { Action, ActionDependencyAttributes, ActionKind, Resolved, ResolvedAction } from "../actions/types.js"
import { actionReferenceToString } from "../actions/base.js"
import type { BuildAction } from "../actions/build.js"
import type { ActionReference } from "../config/common.js"
import { parseActionReference } from "../config/common.js"
import type { GardenModule } from "../types/module.js"
import type { GetManyParams, ModuleGraph } from "./modules.js"
import { getNames } from "../util/util.js"
import { nodeKey } from "./common.js"
import type { DeployAction } from "../actions/deploy.js"
import type { RunAction } from "../actions/run.js"
import type { TestAction } from "../actions/test.js"
import type { GroupConfig } from "../config/group.js"
import { minimatch } from "minimatch"
import { GraphError } from "../exceptions.js"
import { styles } from "../logger/styles.js"

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
  type: string
  moduleName?: string
  key: string
  disabled: boolean
}

export type GraphNodes = { [key: string]: ConfigGraphNode }

export interface GetActionOpts {
  includeDisabled?: boolean
  ignoreMissing?: boolean
}

interface GetActionsParams extends GetActionOpts {
  names?: string[] // Explicit names that must be found
  moduleNames?: string[] // If specified, the found actions must be from these modules
  includeNames?: string[] // Glob patterns to include. An action is returned if its name matches any of these.
  excludeNames?: string[] // Glob patterns to exclude. An action is returned if its name matches none of these.
}

export type PickTypeByKind<
  K extends ActionKind,
  B extends BuildAction,
  D extends DeployAction,
  R extends RunAction,
  T extends TestAction,
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
  T extends TestAction,
> {
  protected dependencyGraph: GraphNodes

  protected readonly actions: {
    Build: { [key: string]: B }
    Deploy: { [key: string]: D }
    Run: { [key: string]: R }
    Test: { [key: string]: T }
  }

  protected readonly groups: {
    [key: string]: GroupConfig
  }

  readonly moduleGraph: ModuleGraph
  readonly environmentName: string

  constructor({
    environmentName,
    actions,
    moduleGraph,
    groups,
  }: {
    environmentName: string
    actions: Action[]
    moduleGraph: ModuleGraph
    groups: GroupConfig[]
  }) {
    this.environmentName = environmentName
    this.dependencyGraph = {}
    this.actions = {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    }
    this.groups = {}
    this.moduleGraph = moduleGraph

    for (const action of actions) {
      this.addActionInternal(action)
    }

    for (const group of groups) {
      this.groups[group.name] = group
    }

    this.validate()
  }

  toSanitizedValue() {
    // TODO
    return "<ConfigGraph>"
  }

  validate() {
    // TODO-0.13.0: checks for circular dependencies
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

  getActions({ refs }: { refs?: (ActionReference | string)[] } = {}): A[] {
    // TODO: maybe we can optimize this one :P
    const all = Object.values(this.actions).flatMap((a) => <A[]>Object.values(a))
    if (refs) {
      const stringRefs = refs.map(actionReferenceToString)
      return all.filter((a) => stringRefs.includes(a.key()) || stringRefs.includes(a.name))
    } else {
      return all
    }
  }

  getActionByRef(refOrString: ActionReference | string, opts?: GetActionOpts): A {
    const ref = parseActionReference(refOrString)
    return <A>(<unknown>this.getActionByKind(ref.kind, ref.name, opts))
  }

  getActionByKind<K extends ActionKind>(
    kind: K,
    name: string,
    opts: GetActionOpts = {}
  ): PickTypeByKind<K, B, D, R, T> {
    const action = this.actions[kind][name]

    if (!action) {
      throw new GraphError({
        message: dedent`
          Could not find ${kind} action ${name}.

          Declared action names for action kind '${kind}': ${naturalList(this.getNamesByKind()[kind])}`,
      })
    }

    if (action.isDisabled() && !opts.includeDisabled) {
      throw new GraphError({
        message: `${action.longDescription()} is disabled.`,
      })
    }

    return <PickTypeByKind<K, B, D, R, T>>action
  }

  getNamesByKind() {
    return mapValues(this.actions, (byKind) => getNames(Object.values(byKind)))
  }

  getActionsByKind<K extends ActionKind>(
    kind: K,
    {
      names,
      moduleNames,
      includeNames,
      excludeNames,
      includeDisabled = false,
      ignoreMissing = false,
    }: GetActionsParams = {}
  ): PickTypeByKind<K, B, D, R, T>[] {
    const foundNames: string[] = []

    const found = Object.values(this.actions[kind]).filter((a) => {
      if (a.isDisabled() && !includeDisabled) {
        return false
      }
      if (moduleNames && !moduleNames.includes(a.moduleName())) {
        return false
      }
      if (includeNames) {
        const matched = find(includeNames, (n: string) => minimatch(a.name, n))
        if (!matched) {
          return false
        }
      }
      if (excludeNames) {
        const matched = find(excludeNames, (n: string) => minimatch(a.name, n))
        if (matched) {
          return false
        }
      }
      if (names) {
        if (!names.includes(a.name)) {
          return false
        }
        foundNames.push(a.name)
      }
      return true
    })

    if (!ignoreMissing && names && names.length > found.length) {
      const missing = difference(names, foundNames)

      throw new GraphError({
        message: dedent`
        Could not find one or more ${kind} actions: ${naturalList(missing)}.
        To get the list of the available ${styles.accent(kind)} actions please use ${styles.command(`get ${kind.toLowerCase()}s`)} command.
        To get the list of all actions please use ${styles.command("get actions")} command.
        `,
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

  getGroup(name: string): GroupConfig {
    const group = this.groups[name]

    if (!group) {
      throw new GraphError({
        message: dedent`
          Could not find Group ${name}.

          Available groups: ${Object.keys(this.groups)}`,
      })
    }

    return group
  }

  getGroups(): GroupConfig[] {
    return Object.values(this.groups)
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
    return nodes.map((n) => this.actions[n.kind][n.name])
  }

  // private uniqueNames(nodes: ConfigGraphNode[], type: ActionKind) {
  //   return uniq(nodes.filter((n) => n.type === type).map((n) => n.name))
  // }

  render(): RenderedActionGraph {
    const nodes = Object.values(this.dependencyGraph)
    let edges: ConfigGraphEdge[] = []
    const simpleEdges: [string, string | undefined][] = []
    for (const dependant of nodes) {
      for (const dependency of dependant.dependencies) {
        edges.push({ dependant, dependency })
        simpleEdges.push([
          nodeKey(dependant.kind, dependant.name),
          nodeKey(dependency.kind, dependency.name) as string | undefined,
        ])
      }
    }

    const sortedNodeKeys = toposort(simpleEdges)

    const edgeSortIndex = (e: ConfigGraphEdge) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(e.dependency.kind, e.dependency.name))
    }
    edges = edges.sort((e1, e2) => edgeSortIndex(e2) - edgeSortIndex(e1))
    const renderedEdges = edges.map((e) => ({
      dependant: e.dependant.render(),
      dependency: e.dependency.render(),
    }))

    const nodeSortIndex = (n: ConfigGraphNode) => {
      return sortedNodeKeys.findIndex((k: string) => k === nodeKey(n.kind, n.name))
    }
    const renderedNodes = nodes.sort((n1, n2) => nodeSortIndex(n2) - nodeSortIndex(n1)).map((n) => n.render())

    return {
      relationships: renderedEdges,
      nodes: renderedNodes,
    }
  }

  toMutableGraph() {
    return new MutableConfigGraph({
      environmentName: this.environmentName,
      actions: this.getActions(),
      moduleGraph: this.moduleGraph,
      groups: Object.values(this.groups),
    })
  }

  protected addActionInternal<K extends ActionKind>(action: Action) {
    this.actions[action.kind][action.name] = <PickTypeByKind<K, B, D, R, T>>action
    const node = this.getNode(action.kind, action.type, action.name, action.isDisabled())

    for (const dep of action.getDependencyReferences()) {
      this.addRelation({
        dependant: node,
        dependencyKind: dep.kind,
        dependencyType: dep.type,
        dependencyName: dep.name,
      })
    }
  }

  // Idempotent.
  protected getNode(kind: ActionKind, type: string, name: string, disabled: boolean) {
    const key = nodeKey(kind, name)
    const existingNode = this.dependencyGraph[key]
    if (existingNode) {
      if (disabled) {
        existingNode.disabled = true
      }
      return existingNode
    } else {
      const newNode = new ConfigGraphNode(kind, type, name, disabled)
      this.dependencyGraph[key] = newNode
      return newNode
    }
  }

  // Idempotent.
  protected addRelation({
    dependant,
    dependencyKind,
    dependencyType,
    dependencyName,
  }: {
    dependant: ConfigGraphNode
    dependencyKind: ActionKind
    dependencyType: string
    dependencyName: string
  }) {
    const dependency = this.getNode(dependencyKind, dependencyType, dependencyName, false)
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

  addDependency(by: ActionReference | string, on: ActionReference | string, attributes: ActionDependencyAttributes) {
    const dependant = this.getActionByRef(by)
    const dependency = this.getActionByRef(on)

    dependant.addDependency({ kind: dependency.kind, type: dependency.type, name: dependency.name, ...attributes })

    this.addRelation({
      dependant: this.getNode(dependant.kind, dependant.type, dependant.name, dependant.isDisabled()),
      dependencyKind: dependency.kind,
      dependencyType: dependency.type,
      dependencyName: dependency.name,
    })
  }

  toConfigGraph(): ConfigGraph {
    return this
  }
}

export interface ConfigGraphEdge {
  dependant: ConfigGraphNode
  dependency: ConfigGraphNode
}

export class ConfigGraphNode {
  dependencies: ConfigGraphNode[]
  dependants: ConfigGraphNode[]

  constructor(
    public kind: ActionKind,
    public type: string,
    public name: string,
    public disabled: boolean
  ) {
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    return {
      name: this.name,
      kind: this.kind,
      key: this.name,
      disabled: this.disabled,
      type: this.type,
    }
  }

  // Idempotent.
  addDependency(node: ConfigGraphNode) {
    const key = nodeKey(node.kind, node.name)
    if (!this.dependencies.find((d) => nodeKey(d.kind, d.name) === key)) {
      this.dependencies.push(node)
    }
  }

  // Idempotent.
  addDependant(node: ConfigGraphNode) {
    const key = nodeKey(node.kind, node.name)
    if (!this.dependants.find((d) => nodeKey(d.kind, d.name) === key)) {
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
      // TODO-0.13.1: This feels out of place here
      if (n.kind !== "Build" && n.disabled) {
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

  toSanitizedValue() {
    return `<Node: ${this.name}`
  }
}
