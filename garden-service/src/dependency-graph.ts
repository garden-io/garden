/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { flatten, fromPairs, pick, uniq } from "lodash"
import { Garden } from "./garden"
import { BuildDependencyConfig } from "./config/module"
import { Module, getModuleKey } from "./types/module"
import { Service } from "./types/service"
import { Workflow } from "./types/workflow"
import { TestConfig } from "./config/test"
import { uniqByName } from "./util/util"

export type DependencyGraphNodeType = "build" | "service" | "workflow" | "test"
  | "push" | "publish" // these two types are currently not represented in DependencyGraph

// The primary output type (for dependencies and dependants).
export type DependencyRelations = {
  build: Module[],
  service: Service[],
  workflow: Workflow[],
  test: TestConfig[],
}

type DependencyRelationNames = {
  build: string[],
  service: string[],
  workflow: string[],
  test: string[],
}

export type DependencyRelationFilterFn = (DependencyGraphNode) => boolean

export class DependencyGraph {

  index: { [key: string]: DependencyGraphNode }
  private garden: Garden
  private serviceMap: { [key: string]: Service }
  private workflowMap: { [key: string]: Workflow }
  private testConfigMap: { [key: string]: TestConfig }
  private testConfigModuleMap: { [key: string]: Module }

  static async factory(garden: Garden) {
    const { modules, services, workflows } = await Bluebird.props({
      modules: garden.getModules(),
      services: garden.getServices(),
      workflows: garden.getWorkflows(),
    })

    return new DependencyGraph(garden, modules, services, workflows)
  }

  constructor(garden: Garden, modules: Module[], services: Service[], workflows: Workflow[]) {

    this.garden = garden
    this.index = {}

    this.serviceMap = fromPairs(services.map(s => [s.name, s]))
    this.workflowMap = fromPairs(workflows.map(w => [w.name, w]))
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
            this.addRelation(serviceNode, "workflow", depName, this.keyForModule(this.workflowMap[depName].module))
          }
        }
      }

      // Workflow dependencies
      for (const workflowConfig of module.workflowConfigs) {
        const workflowNode = this.getNode("workflow", workflowConfig.name, moduleKey)
        this.addRelation(workflowNode, "build", moduleKey, moduleKey)
        for (const depName of workflowConfig.dependencies) {
          if (this.serviceMap[depName]) {
            this.addRelation(workflowNode, "service", depName, this.keyForModule(this.serviceMap[depName].module))
          } else {
            this.addRelation(workflowNode, "workflow", depName, this.keyForModule(this.workflowMap[depName].module))
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
            this.addRelation(testNode, "workflow", depName, this.keyForModule(this.workflowMap[depName].module))
          }
        }
      }

    }
  }

  // Convenience method used in the constructor above.
  keyForModule(module: Module | BuildDependencyConfig) {
    return getModuleKey(module.name, module.plugin)
  }

  /**
   * If filterFn is provided to any of the methods below that accept it, matching nodes
   * (and their dependencies/dependants, if recursive = true) are ignored.
   */

  /**
   * Returns the set union of modules with the set union of their dependants (across all dependency types).
   * Recursive.
   */
  async withDependantModules(modules: Module[], filterFn?: DependencyRelationFilterFn): Promise<Module[]> {
    const dependants = flatten(await Bluebird.map(modules, m => this.getDependantsForModule(m, filterFn)))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    const dependantModules = await this.modulesForRelations(
      await this.mergeRelations(...dependants))
    return this.garden.getModules(uniq(modules.concat(dependantModules).map(m => m.name)))
  }

  // Recursive.
  async getDependantsForModule(module: Module, filterFn?: DependencyRelationFilterFn): Promise<DependencyRelations> {
    const runtimeDependencies = uniq(module.serviceDependencyNames.concat(module.workflowDependencyNames))
    const serviceNames = runtimeDependencies.filter(d => this.serviceMap[d])
    const workflowNames = runtimeDependencies.filter(d => this.workflowMap[d])

    return this.mergeRelations(... await Bluebird.all([
      this.getDependants("build", module.name, true, filterFn),
      // this.getDependantsForMany("build", module.build.dependencies.map(d => d.name), true, filterFn),
      this.getDependantsForMany("service", serviceNames, true, filterFn),
      this.getDependantsForMany("workflow", workflowNames, true, filterFn),
    ]))
  }

  async getDependencies(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependencyNodes(nodeType, name, recursive, filterFn))
  }

  async getDependants(
    nodeType: DependencyGraphNodeType, name: string, recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependantNodes(nodeType, name, recursive, filterFn))
  }

  async getDependenciesForMany(
    nodeType: DependencyGraphNodeType, names: string[], recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(
      names.map(name => this.getDependencyNodes(nodeType, name, recursive, filterFn))))
  }

  async getDependantsForMany(
    nodeType: DependencyGraphNodeType, names: string[], recursive: boolean, filterFn?: DependencyRelationFilterFn,
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(
      names.map(name => this.getDependantNodes(nodeType, name, recursive, filterFn))))
  }

  /**
   * Computes the set union for each node type across relationArr (i.e. concatenates
   * and deduplicates for each key).
   */
  async mergeRelations(...relationArr: DependencyRelations[]): Promise<DependencyRelations> {
    const names = {}
    for (const type of ["build", "service", "workflow", "test"]) {
      names[type] = uniqByName(flatten(relationArr.map(r => r[type]))).map(r => r.name)
    }

    return this.relationsFromNames({
      build: names["build"],
      service: names["service"],
      workflow: names["workflow"],
      test: names["test"],
    })
  }

  async modulesForRelations(relations: DependencyRelations): Promise<Module[]> {
    const moduleNames = uniq(flatten([
      relations.build,
      relations.service.map(s => s.module),
      relations.workflow.map(w => w.module),
      relations.test.map(t => this.testConfigModuleMap[t.name]),
    ]).map(m => m.name))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    return this.garden.getModules(moduleNames)
  }

  private async toRelations(nodes): Promise<DependencyRelations> {
    return this.relationsFromNames({
      build: this.uniqueNames(nodes, "build"),
      service: this.uniqueNames(nodes, "service"),
      workflow: this.uniqueNames(nodes, "workflow"),
      test: this.uniqueNames(nodes, "test"),
    })
  }

  private async relationsFromNames(names: DependencyRelationNames): Promise<DependencyRelations> {
    return Bluebird.props({
      build: this.garden.getModules(names.build),
      service: this.garden.getServices(names.service),
      workflow: this.garden.getWorkflows(names.workflow),
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

  // For testing/debugging.
  renderGraph() {
    const nodes = Object.values(this.index)
    const edges: string[][] = []
    for (const node of nodes) {
      for (const dep of node.dependencies) {
        edges.push([nodeKey(node.type, node.name), nodeKey(dep.type, dep.name)])
      }
    }
    return edges
  }

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
