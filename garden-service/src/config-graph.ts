/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
const toposort = require("toposort")
import { flatten, pick, uniq, find, sortBy } from "lodash"
import { Garden } from "./garden"
import { BuildDependencyConfig, ModuleConfig } from "./config/module"
import { Module, getModuleKey, moduleFromConfig } from "./types/module"
import { Service, serviceFromConfig } from "./types/service"
import { Task, taskFromConfig } from "./types/task"
import { TestConfig } from "./config/test"
import { uniqByName, pickKeys } from "./util/util"
import { ConfigurationError } from "./exceptions"
import { deline } from "./util/string"
import { validateDependencies } from "./util/validate-dependencies"
import { ServiceConfig } from "./config/service"
import { TaskConfig } from "./config/task"
import { makeTestTaskName } from "./tasks/helpers"
import { TaskType, makeBaseKey } from "./tasks/base"

// Each of these types corresponds to a Task class (e.g. BuildTask, DeployTask, ...).
export type DependencyGraphNodeType = "build" | "service" | "task" | "test" | "publish"

// The primary output type (for dependencies and dependants).
export type DependencyRelations = {
  build: Module[]
  service: Service[]
  task: Task[]
  test: TestConfig[]
}

type DependencyRelationNames = {
  build: string[]
  service: string[]
  task: string[]
  test: string[]
}

export type DependencyRelationFilterFn = (DependencyGraphNode) => boolean

// Output types for rendering/logging
export type RenderedGraph = {
  nodes: RenderedNode[]
  relationships: RenderedEdge[]
}
export type RenderedEdge = { dependant: RenderedNode; dependency: RenderedNode }
export type RenderedNodeType = "build" | "deploy" | "run" | "test" | "publish"
export interface RenderedNode {
  type: RenderedNodeType
  name: string
  moduleName: string
  key: string
}
type DepNodeTaskTypeMap = { [key in DependencyGraphNodeType]: TaskType }
type RenderedNodeTypeMap = {
  [key in DependencyGraphNodeType]: RenderedNodeType
}

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 *
 * This should be initialized with fully resolved and validated ModuleConfigs.
 */
export class ConfigGraph {
  private dependencyGraph: { [key: string]: DependencyGraphNode }
  private moduleConfigs: { [key: string]: ModuleConfig }

  private serviceConfigs: {
    [key: string]: { moduleKey: string; config: ServiceConfig }
  }
  private taskConfigs: {
    [key: string]: { moduleKey: string; config: TaskConfig }
  }
  private testConfigs: {
    [key: string]: { moduleKey: string; config: TestConfig }
  }

  constructor(private garden: Garden, moduleConfigs: ModuleConfig[]) {
    this.garden = garden
    this.dependencyGraph = {}
    this.moduleConfigs = {}
    this.serviceConfigs = {}
    this.taskConfigs = {}
    this.testConfigs = {}

    for (const moduleConfig of moduleConfigs) {
      const moduleKey = this.keyForModule(moduleConfig)
      this.moduleConfigs[moduleKey] = moduleConfig

      // Add services
      for (const serviceConfig of moduleConfig.serviceConfigs) {
        const serviceName = serviceConfig.name

        if (this.taskConfigs[serviceName]) {
          throw serviceTaskConflict(serviceName, this.taskConfigs[serviceName].moduleKey, moduleKey)
        }

        if (this.serviceConfigs[serviceName]) {
          const [moduleA, moduleB] = [moduleKey, this.serviceConfigs[serviceName].moduleKey].sort()

          throw new ConfigurationError(
            deline`
            Service names must be unique - the service name '${serviceName}' is declared multiple times
            (in modules '${moduleA}' and '${moduleB}')`,
            {
              serviceName,
              moduleA,
              moduleB,
            }
          )
        }

        // Make sure service source modules are added as build dependencies for the module
        const { sourceModuleName } = serviceConfig
        if (sourceModuleName && !find(moduleConfig.build.dependencies, ["name", sourceModuleName])) {
          moduleConfig.build.dependencies.push({
            name: sourceModuleName,
            copy: [],
          })
        }

        this.serviceConfigs[serviceName] = { moduleKey, config: serviceConfig }
      }

      // Add tasks
      for (const taskConfig of moduleConfig.taskConfigs) {
        const taskName = taskConfig.name

        if (this.serviceConfigs[taskName]) {
          throw serviceTaskConflict(taskName, moduleKey, this.serviceConfigs[taskName].moduleKey)
        }

        if (this.taskConfigs[taskName]) {
          const [moduleA, moduleB] = [moduleKey, this.taskConfigs[taskName].moduleKey].sort()

          throw new ConfigurationError(
            deline`
            Task names must be unique - the task name '${taskName}' is declared multiple times (in modules
            '${moduleA}' and '${moduleB}')`,
            {
              taskName,
              moduleA,
              moduleB,
            }
          )
        }

        this.taskConfigs[taskName] = { moduleKey, config: taskConfig }
      }
    }

    this.validateDependencies()

    for (const moduleConfig of moduleConfigs) {
      const moduleKey = this.keyForModule(moduleConfig)
      this.moduleConfigs[moduleKey] = moduleConfig

      // Build dependencies
      const buildNode = this.getNode("build", moduleKey, moduleKey)
      for (const buildDep of moduleConfig.build.dependencies) {
        const buildDepKey = getModuleKey(buildDep.name, buildDep.plugin)
        this.addRelation(buildNode, "build", buildDepKey, buildDepKey)
      }

      // Service dependencies
      for (const serviceConfig of moduleConfig.serviceConfigs) {
        const serviceNode = this.getNode("service", serviceConfig.name, moduleKey)
        this.addRelation(serviceNode, "build", moduleKey, moduleKey)
        for (const depName of serviceConfig.dependencies) {
          if (this.serviceConfigs[depName]) {
            this.addRelation(serviceNode, "service", depName, this.serviceConfigs[depName].moduleKey)
          } else {
            this.addRelation(serviceNode, "task", depName, this.taskConfigs[depName].moduleKey)
          }
        }
      }

      // Task dependencies
      for (const taskConfig of moduleConfig.taskConfigs) {
        const taskNode = this.getNode("task", taskConfig.name, moduleKey)
        this.addRelation(taskNode, "build", moduleKey, moduleKey)
        for (const depName of taskConfig.dependencies) {
          if (this.serviceConfigs[depName]) {
            this.addRelation(taskNode, "service", depName, this.serviceConfigs[depName].moduleKey)
          } else {
            this.addRelation(taskNode, "task", depName, this.taskConfigs[depName].moduleKey)
          }
        }
      }

      // Test dependencies
      for (const testConfig of moduleConfig.testConfigs) {
        const testConfigName = makeTestTaskName(moduleConfig.name, testConfig.name)

        this.testConfigs[testConfigName] = { moduleKey, config: testConfig }

        const testNode = this.getNode("test", testConfigName, moduleKey)
        this.addRelation(testNode, "build", moduleKey, moduleKey)
        for (const depName of testConfig.dependencies) {
          if (this.serviceConfigs[depName]) {
            this.addRelation(testNode, "service", depName, this.serviceConfigs[depName].moduleKey)
          } else {
            this.addRelation(testNode, "task", depName, this.taskConfigs[depName].moduleKey)
          }
        }
      }
    }
  }

  // Convenience method used in the constructor above.
  keyForModule(config: ModuleConfig | BuildDependencyConfig) {
    return getModuleKey(config.name, config.plugin)
  }

  private validateDependencies() {
    validateDependencies(
      Object.values(this.moduleConfigs),
      Object.keys(this.serviceConfigs),
      Object.keys(this.taskConfigs)
    )
  }

  /**
   * Returns the Service with the specified name. Throws error if it doesn't exist.
   */
  async getModule(name: string): Promise<Module> {
    return (await this.getModules([name]))[0]
  }

  /**
   * Returns the Service with the specified name. Throws error if it doesn't exist.
   */
  async getService(name: string): Promise<Service> {
    return (await this.getServices([name]))[0]
  }

  /**
   * Returns the Task with the specified name. Throws error if it doesn't exist.
   */
  async getTask(name: string): Promise<Task> {
    return (await this.getTasks([name]))[0]
  }

  /*
    Returns all modules defined in this configuration graph, or the ones specified.
   */
  async getModules(names?: string[]): Promise<Module[]> {
    const configs = Object.values(names ? pickKeys(this.moduleConfigs, names, "module") : this.moduleConfigs)

    return Bluebird.map(configs, (config) => moduleFromConfig(this.garden, this, config))
  }

  /*
    Returns all services defined in this configuration graph, or the ones specified.
   */
  async getServices(names?: string[]): Promise<Service[]> {
    const entries = Object.values(names ? pickKeys(this.serviceConfigs, names, "service") : this.serviceConfigs)

    return Bluebird.map(entries, async (e) => serviceFromConfig(this, await this.getModule(e.moduleKey), e.config))
  }

  /*
    Returns all tasks defined in this configuration graph, or the ones specified.
   */
  async getTasks(names?: string[]): Promise<Task[]> {
    const entries = Object.values(names ? pickKeys(this.taskConfigs, names, "task") : this.taskConfigs)

    return Bluebird.map(entries, async (e) => taskFromConfig(await this.getModule(e.moduleKey), e.config))
  }

  /*
   * If filterFn is provided to any of the methods below that accept it, matching nodes
   * (and their dependencies/dependants, if recursive = true) are ignored.
   */

  /**
   * Returns the set union of modules with the set union of their dependants (across all dependency types, recursively).
   */
  async withDependantModules(modules: Module[], filterFn?: DependencyRelationFilterFn): Promise<Module[]> {
    const dependants = flatten(await Bluebird.map(modules, (m) => this.getDependantsForModule(m, filterFn)))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    const dependantModules = await this.modulesForRelations(await this.mergeRelations(...dependants))
    return this.getModules(uniq(modules.concat(dependantModules).map((m) => m.name)))
  }

  /**
   * Returns all build and runtime dependants of module and its services & tasks (recursively).
   */
  async getDependantsForModule(module: Module, filterFn?: DependencyRelationFilterFn): Promise<DependencyRelations> {
    return this.mergeRelations(
      ...(await Bluebird.all([
        this.getDependants("build", module.name, true, filterFn),
        this.getDependantsForMany("service", module.serviceNames, true, filterFn),
        this.getDependantsForMany("task", module.taskNames, true, filterFn),
      ]))
    )
  }

  /**
   * Returns all dependencies of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependencies' dependencies, etc.
   */
  async getDependencies(
    nodeType: DependencyGraphNodeType,
    name: string,
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependencyNodes(nodeType, name, recursive, filterFn))
  }

  /**
   * Returns all dependants of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  async getDependants(
    nodeType: DependencyGraphNodeType,
    name: string,
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): Promise<DependencyRelations> {
    return this.toRelations(this.getDependantNodes(nodeType, name, recursive, filterFn))
  }

  /**
   * Same as getDependencies above, but returns the set union of the dependencies of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  async getDependenciesForMany(
    nodeType: DependencyGraphNodeType,
    names: string[],
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(names.map((name) => this.getDependencyNodes(nodeType, name, recursive, filterFn))))
  }

  /**
   * Same as getDependants above, but returns the set union of the dependants of the nodes in the graph
   * having type = nodeType and name = name (computed recursively or shallowly for all).
   */
  async getDependantsForMany(
    nodeType: DependencyGraphNodeType,
    names: string[],
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): Promise<DependencyRelations> {
    return this.toRelations(flatten(names.map((name) => this.getDependantNodes(nodeType, name, recursive, filterFn))))
  }

  /**
   * Returns the set union for each node type across relationArr (i.e. concatenates and deduplicates for each key).
   */
  async mergeRelations(...relationArr: DependencyRelations[]): Promise<DependencyRelations> {
    const names = {}
    for (const type of ["build", "service", "task", "test"]) {
      names[type] = uniqByName(flatten(relationArr.map((r) => r[type]))).map((r) => r.name)
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
    const moduleNames = uniq(
      flatten([
        relations.build,
        relations.service.map((s) => s.module),
        relations.task.map((w) => w.module),
        await this.getModules(relations.test.map((t) => this.testConfigs[t.name].moduleKey)),
      ]).map((m) => m.name)
    )
    // We call getModules to ensure that the returned modules have up-to-date versions.
    return this.getModules(moduleNames)
  }

  /**
   * Given the provided lists of build and runtime (service/task) dependencies, return a list of all
   * modules required to satisfy those dependencies.
   */
  async resolveDependencyModules(
    buildDependencies: BuildDependencyConfig[],
    runtimeDependencies: string[]
  ): Promise<Module[]> {
    const moduleNames = buildDependencies.map((d) => getModuleKey(d.name, d.plugin))
    const serviceNames = runtimeDependencies.filter((d) => this.serviceConfigs[d])
    const taskNames = runtimeDependencies.filter((d) => this.taskConfigs[d])

    const buildDeps = await this.getDependenciesForMany("build", moduleNames, true)
    const serviceDeps = await this.getDependenciesForMany("service", serviceNames, true)
    const taskDeps = await this.getDependenciesForMany("task", taskNames, true)

    const modules = [
      ...(await this.getModules(moduleNames)),
      ...(await this.modulesForRelations(await this.mergeRelations(buildDeps, serviceDeps, taskDeps))),
    ]

    return sortBy(uniqByName(modules), "name")
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
      build: this.getModules(names.build),
      service: this.getServices(names.service),
      task: this.getTasks(names.task),
      test: Object.values(pick(this.testConfigs, names.test)).map((t) => t.config),
    })
  }

  private getDependencyNodes(
    nodeType: DependencyGraphNodeType,
    name: string,
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): DependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(nodeType, name)]
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
    nodeType: DependencyGraphNodeType,
    name: string,
    recursive: boolean,
    filterFn?: DependencyRelationFilterFn
  ): DependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(nodeType, name)]
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
    return uniq(nodes.filter((n) => n.type === type).map((n) => n.name))
  }

  // Idempotent.
  private addRelation(
    dependant: DependencyGraphNode,
    dependencyType: DependencyGraphNodeType,
    dependencyName: string,
    dependencyModuleName: string
  ) {
    const dependency = this.getNode(dependencyType, dependencyName, dependencyModuleName)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }

  // Idempotent.
  private getNode(type: DependencyGraphNodeType, name: string, moduleName: string) {
    const key = nodeKey(type, name)
    const existingNode = this.dependencyGraph[key]
    if (existingNode) {
      return existingNode
    } else {
      const newNode = new DependencyGraphNode(type, name, moduleName)
      this.dependencyGraph[key] = newNode
      return newNode
    }
  }

  render(): RenderedGraph {
    const nodes = Object.values(this.dependencyGraph)
    let edges: {
      dependant: DependencyGraphNode
      dependency: DependencyGraphNode
    }[] = []
    let simpleEdges: string[][] = []
    for (const dependant of nodes) {
      for (const dependency of dependant.dependencies) {
        edges.push({ dependant, dependency })
        simpleEdges.push([nodeKey(dependant.type, dependant.name), nodeKey(dependency.type, dependency.name)])
      }
    }

    const sortedNodeKeys = toposort(simpleEdges)

    const edgeSortIndex = (e) => {
      return sortedNodeKeys.findIndex((k) => k === nodeKey(e.dependency.type, e.dependency.name))
    }
    edges = edges.sort((e1, e2) => edgeSortIndex(e2) - edgeSortIndex(e1))
    const renderedEdges = edges.map((e) => ({
      dependant: e.dependant.render(),
      dependency: e.dependency.render(),
    }))

    const nodeSortIndex = (n) => {
      return sortedNodeKeys.findIndex((k) => k === nodeKey(n.type, n.name))
    }
    const renderedNodes = nodes.sort((n1, n2) => nodeSortIndex(n2) - nodeSortIndex(n1)).map((n) => n.render())

    return {
      relationships: renderedEdges,
      nodes: renderedNodes,
    }
  }
}

const renderedNodeTypeMap: RenderedNodeTypeMap = {
  build: "build",
  service: "deploy",
  task: "run",
  test: "test",
  publish: "publish",
}

const depNodeTaskTypeMap: DepNodeTaskTypeMap = {
  build: "build",
  service: "deploy",
  task: "task",
  test: "test",
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
    const name = this.type === "test" ? parseTestKey(this.name).testName : this.name
    const renderNodeType = <RenderedNodeType>renderedNodeTypeMap[this.type]
    const taskType = <TaskType>depNodeTaskTypeMap[this.type]
    return {
      name,
      type: renderNodeType,
      moduleName: this.moduleName,
      key: makeBaseKey(taskType, this.name),
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
   * If filterFn is provided, ignores matching nodes and their dependencies.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  recursiveDependencies(filterFn?: DependencyRelationFilterFn) {
    const deps = filterFn ? this.dependencies.filter(filterFn) : this.dependencies
    return flatten(deps.concat(deps.map((d) => d.recursiveDependencies(filterFn))))
  }

  /**
   * If filterFn is provided, ignores matching nodes and their dependants.
   * Note: May return duplicate entries (deduplicated in DependencyGraph#toRelations).
   */
  recursiveDependants(filterFn?: DependencyRelationFilterFn) {
    const dependants = filterFn ? this.dependants.filter(filterFn) : this.dependants
    return flatten(dependants.concat(dependants.map((d) => d.recursiveDependants(filterFn))))
  }
}

/**
 * Note: If type === "build", name should be a prefix-qualified module name, as
 * returned by keyForModule or getModuleKey.
 */
function nodeKey(type: DependencyGraphNodeType, name: string) {
  return `${type}.${name}`
}

function parseTestKey(key: string) {
  const [moduleName, testName] = key.split(".")
  return { moduleName, testName }
}

function serviceTaskConflict(conflictingName: string, moduleWithTask: string, moduleWithService: string) {
  return new ConfigurationError(
    deline`
    Service and task names must be mutually unique - the name '${conflictingName}' is used for a task in
    '${moduleWithTask}' and for a service in '${moduleWithService}'`,
    {
      conflictingName,
      moduleWithTask,
      moduleWithService,
    }
  )
}
