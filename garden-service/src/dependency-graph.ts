/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
const toposort = require("toposort")
import { flatten, fromPairs, pick, uniq } from "lodash"
import { Garden } from "./garden"
import { BuildDependencyConfig } from "./config/module"
import { Module, getModuleKey } from "./types/module"
import { Service } from "./types/service"
import { Task } from "./types/task"
import { TestConfig } from "./config/test"
import { uniqByName } from "./util/util"

// Each of these types corresponds to a Task class (e.g. BuildTask, DeployTask, ...).
export type DependencyGraphNodeType = "build" | "service" | "task" | "test"
  | "push" | "publish" // these two types are currently not represented in DependencyGraph

// The primary output type (for dependencies and dependants).
export type DependencyRelations = {
  build: Module[],
  service: Service[],
  task: Task[],
  test: TestConfig[],
}

type DependencyRelationNames = {
  build: string[],
  service: string[],
  task: string[],
  test: string[],
}

export type DependencyRelationFilterFn = (DependencyGraphNode) => boolean

// Output types for rendering/logging

export type RenderedGraph = { nodes: RenderedNode[], relationships: RenderedEdge[] }

export type RenderedEdge = { dependant: RenderedNode, dependency: RenderedNode }

export type RenderedNode = { type: RenderedNodeType, name: string }

export type RenderedNodeType = "build" | "deploy" | "runTask" | "test" | "push" | "publish"

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 */
export class DependencyGraph {

  index: { [key: string]: DependencyGraphNode }
  private garden: Garden
  private serviceMap: { [key: string]: Service }
  private taskMap: { [key: string]: Task }
  private testConfigMap: { [key: string]: TestConfig }
  private testConfigModuleMap: { [key: string]: Module }

  static async factory(garden: Garden) {
    const { modules, services, tasks } = await Bluebird.props({
      modules: garden.getModules(),
      services: garden.getServices(),
      tasks: garden.getTasks(),
    })

    return new DependencyGraph(garden, modules, services, tasks)
  }

  constructor(garden: Garden, modules: Module[], services: Service[], tasks: Task[]) {

    this.garden = garden
    this.index = {}

    this.serviceMap = fromPairs(services.map(s => [s.name, s]))
    this.taskMap = fromPairs(tasks.map(w => [w.name, w]))
    this.testConfigMap = {}
    this.testConfigModuleMap = {}

    for (const module of modules) {

      const moduleKey = this.keyForModule(module)

      // Build dependencies
      const buildNode = this.getNode("build", moduleKey, moduleKey)
      for (const buildDep of module.build.dependencies) {
        const buildDepKey = getModuleKey(buildDep.name, buildDep.plugin)
        this.addRelation(buildNode, "build", buildDepKey, buildDepKey)
      }

      // Service dependencies
      for (const serviceConfig of module.serviceConfigs) {
        const serviceNode = this.getNode("service", serviceConfig.name, moduleKey)
        this.addRelation(serviceNode, "build", moduleKey, moduleKey)
        for (const depName of serviceConfig.dependencies) {
          if (this.serviceMap[depName]) {
            this.addRelation(serviceNode, "service", depName, this.keyForModule(this.serviceMap[depName].module))
          } else {
            this.addRelation(serviceNode, "task", depName, this.keyForModule(this.taskMap[depName].module))
          }
        }
      }

      // Task dependencies
      for (const taskConfig of module.taskConfigs) {
        const taskNode = this.getNode("task", taskConfig.name, moduleKey)
        this.addRelation(taskNode, "build", moduleKey, moduleKey)
        for (const depName of taskConfig.dependencies) {
          if (this.serviceMap[depName]) {
            this.addRelation(taskNode, "service", depName, this.keyForModule(this.serviceMap[depName].module))
          } else {
            this.addRelation(taskNode, "task", depName, this.keyForModule(this.taskMap[depName].module))
          }
        }
      }

      // Test dependencies
      for (const testConfig of module.testConfigs) {
        const testConfigName = `${module.name}.${testConfig.name}`
        this.testConfigMap[testConfigName] = testConfig
        this.testConfigModuleMap[testConfigName] = module
        const testNode = this.getNode("test", testConfigName, moduleKey)
        this.addRelation(testNode, "build", moduleKey, moduleKey)
        for (const depName of testConfig.dependencies) {
          if (this.serviceMap[depName]) {
            this.addRelation(testNode, "service", depName, this.keyForModule(this.serviceMap[depName].module))
          } else {
            this.addRelation(testNode, "task", depName, this.keyForModule(this.taskMap[depName].module))
          }
        }
      }

    }
  }

  // Convenience method used in the constructor above.
  keyForModule(module: Module | BuildDependencyConfig) {
    return getModuleKey(module.name, module.plugin)
  }

  /*
   * If filterFn is provided to any of the methods below that accept it, matching nodes
   * (and their dependencies/dependants, if recursive = true) are ignored.
   */

  /**
   * Returns the set union of modules with the set union of their dependants (across all dependency types, recursively).
   */
  async withDependantModules(modules: Module[], filterFn?: DependencyRelationFilterFn): Promise<Module[]> {
    const dependants = flatten(await Bluebird.map(modules, m => this.getDependantsForModule(m, filterFn)))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    const dependantModules = await this.modulesForRelations(
      await this.mergeRelations(...dependants))
    return this.garden.getModules(uniq(modules.concat(dependantModules).map(m => m.name)))
  }

  /**
   * Returns all build and runtime dependants of module and its services & tasks (recursively).
   */
  async getDependantsForModule(module: Module, filterFn?: DependencyRelationFilterFn): Promise<DependencyRelations> {
    return this.mergeRelations(... await Bluebird.all([
      this.getDependants("build", module.name, true, filterFn),
      this.getDependantsForMany("service", module.serviceNames, true, filterFn),
      this.getDependantsForMany("task", module.taskNames, true, filterFn),
    ]))
  }

  /**
   * Returns all dependencies of a node in DependencyGraph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependencies' dependencies, etc.
   */
  async getDependencies(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependencyNodes(nodeType, name, recursive, filterFn))
  }

  /**
   * Returns all dependants of a node in DependencyGraph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  async getDependants(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependantNodes(nodeType, name, recursive, filterFn))
  }

  /**
   * Same as getDependencies above, but returns the set union of the dependencies of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  async getDependenciesForMany(
    nodeType: DependencyGraphNodeType, names: string[], recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(
      names.map(name => this.getDependencyNodes(nodeType, name, recursive, filterFn))))
  }

  /**
   * Same as getDependants above, but returns the set union of the dependants of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  async getDependantsForMany(
    nodeType: DependencyGraphNodeType, names: string[], recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(
      names.map(name => this.getDependantNodes(nodeType, name, recursive, filterFn))))
  }

  /**
   * Returns the set union for each node type across relationArr (i.e. concatenates and deduplicates for each key).
   */
  async mergeRelations(...relationArr: DependencyRelations[]): Promise<DependencyRelations> {
    const names = {}
    for (const type of ["build", "service", "task", "test"]) {
      names[type] = uniqByName(flatten(relationArr.map(r => r[type]))).map(r => r.name)
    }

    return this.relationsFromNames({
      build: names["build"],
      service: names["service"],
      task: names["task"],
      test: names["test"],
    })
  }

  /**
   * Returns the (unique by name) list of modules represented in relations.
   */
  async modulesForRelations(relations: DependencyRelations): Promise<Module[]> {
    const moduleNames = uniq(flatten([
      relations.build,
      relations.service.map(s => s.module),
      relations.task.map(w => w.module),
      relations.test.map(t => this.testConfigModuleMap[t.name]),
    ]).map(m => m.name))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    return this.garden.getModules(moduleNames)
  }

  private async toRelations(nodes): Promise<DependencyRelations> {
    return this.relationsFromNames({
      build: this.uniqueNames(nodes, "build"),
      service: this.uniqueNames(nodes, "service"),
      task: this.uniqueNames(nodes, "task"),
      test: this.uniqueNames(nodes, "test"),
    })
  }

  private async relationsFromNames(names: DependencyRelationNames): Promise<DependencyRelations> {
    return Bluebird.props({
      build: this.garden.getModules(names.build),
      service: this.garden.getServices(names.service),
      task: this.garden.getTasks(names.task),
      test: Object.values(pick(this.testConfigMap, names.test)),
    })
  }

  private getDependencyNodes(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): DependencyGraphNode[] {
    const node = this.index[nodeKey(nodeType, name)]
    if (node) {
      if (recursive) {
        return node.recursiveDependencies(filterFn)
      } else {
        return filterFn ? node.dependencies.filter(filterFn) : node.dependencies
      }
    } else {
      return []
    }
  }

  private getDependantNodes(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): DependencyGraphNode[] {
    const node = this.index[nodeKey(nodeType, name)]
    if (node) {
      if (recursive) {
        return node.recursiveDependants(filterFn)
      } else {
        return filterFn ? node.dependants.filter(filterFn) : node.dependants
      }
    } else {
      return []
    }
  }

  private uniqueNames(nodes: DependencyGraphNode[], type: DependencyGraphNodeType) {
    return uniq(nodes.filter(n => n.type === type).map(n => n.name))
  }

  // Idempotent.
  private addRelation(
    dependant: DependencyGraphNode, dependencyType: DependencyGraphNodeType,
    dependencyName: string, dependencyModuleName: string,
  ) {
    const dependency = this.getNode(dependencyType, dependencyName, dependencyModuleName)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }

  // Idempotent.
  private getNode(type: DependencyGraphNodeType, name: string, moduleName: string) {
    const key = nodeKey(type, name)
    const existingNode = this.index[key]
    if (existingNode) {
      return existingNode
    } else {
      const newNode = new DependencyGraphNode(type, name, moduleName)
      this.index[key] = newNode
      return newNode
    }
  }

  render(): RenderedGraph {
    const nodes = Object.values(this.index)
    let edges: { dependant: DependencyGraphNode, dependency: DependencyGraphNode }[] = []
    let simpleEdges: string[][] = []
    for (const dependant of nodes) {
      for (const dependency of dependant.dependencies) {
        edges.push({ dependant, dependency })
        simpleEdges.push([
          nodeKey(dependant.type, dependant.name),
          nodeKey(dependency.type, dependency.name),
        ])
      }
    }

    const sortedNodeKeys = toposort(simpleEdges)

    const edgeSortIndex = (e) => {
      return sortedNodeKeys.findIndex(k => k === nodeKey(e.dependency.type, e.dependency.name))
    }
    edges = edges.sort((e1, e2) => edgeSortIndex(e2) - edgeSortIndex(e1))
    const renderedEdges = edges.map(e => ({
      dependant: e.dependant.render(),
      dependency: e.dependency.render(),
    }))

    const nodeSortIndex = (n) => {
      return sortedNodeKeys.findIndex(k => k === nodeKey(n.type, n.name))
    }
    const renderedNodes = nodes.sort((n1, n2) => nodeSortIndex(n2) - nodeSortIndex(n1))
      .map(n => n.render())

    return {
      relationships: renderedEdges,
      nodes: renderedNodes,
    }
  }

}

const renderedNodeTypeMap = {
  build: "build",
  service: "deploy",
  task: "runTask",
  test: "test",
  push: "push",
  publish: "publish",
}

export class DependencyGraphNode {

  type: DependencyGraphNodeType
  name: string // same as a corresponding task's name
  moduleName: string
  dependencies: DependencyGraphNode[]
  dependants: DependencyGraphNode[]

  constructor(type: DependencyGraphNodeType, name: string, moduleName: string) {
    this.type = type
    this.name = name
    this.moduleName = moduleName
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    return {
      type: <RenderedNodeType>renderedNodeTypeMap[this.type],
      name: this.name,
    }
  }

  // Idempotent.
  addDependency(node: DependencyGraphNode) {
    const key = nodeKey(node.type, node.name)
    if (!this.dependencies.find(d => nodeKey(d.type, d.name) === key)) {
      this.dependencies.push(node)
    }
  }

  // Idempotent.
  addDependant(node: DependencyGraphNode) {
    const key = nodeKey(node.type, node.name)
    if (!this.dependants.find(d => nodeKey(d.type, d.name) === key)) {
      this.dependants.push(node)
    }
  }

  /**
   * If filterFn is provided, ignores matching nodes and their dependencies.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  recursiveDependencies(filterFn?: DependencyRelationFilterFn) {
    const deps = filterFn ? this.dependencies.filter(filterFn) : this.dependencies
    return flatten(deps.concat(
      deps.map(d => d.recursiveDependencies(filterFn))))
  }

  /**
   * If filterFn is provided, ignores matching nodes and their dependants.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  recursiveDependants(filterFn?: DependencyRelationFilterFn) {
    const dependants = filterFn ? this.dependants.filter(filterFn) : this.dependants
    return flatten(dependants.concat(
      dependants.map(d => d.recursiveDependants(filterFn))))
  }

}

/**
 * Note: If type === "build", name should be a prefix-qualified module name, as
 * returned by keyForModule or getModuleKey.
 */
function nodeKey(type: DependencyGraphNodeType, name: string) {
  return `${type}.${name}`
}
