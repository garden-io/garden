/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import toposort from "toposort"
import { flatten, pick, uniq, sortBy, pickBy } from "lodash"
import { BuildDependencyConfig } from "./config/module"
import { GardenModule, getModuleKey, moduleNeedsBuild } from "./types/module"
import { GardenService, serviceFromConfig } from "./types/service"
import { GardenTask, taskFromConfig } from "./types/task"
import { TestConfig } from "./config/test"
import { uniqByName, pickKeys } from "./util/util"
import { ConfigurationError } from "./exceptions"
import { deline } from "./util/string"
import { detectMissingDependencies, DependencyValidationGraph } from "./util/validate-dependencies"
import { ServiceConfig } from "./config/service"
import { TaskConfig } from "./config/task"
import { makeTestTaskName } from "./tasks/helpers"
import { TaskType, makeBaseKey } from "./tasks/base"
import { ModuleTypeMap } from "./types/plugin/plugin"
import { testFromModule, GardenTest, testFromConfig } from "./types/test"

// Each of these types corresponds to a Task class (e.g. BuildTask, DeployTask, ...).
export type DependencyGraphNodeType = "build" | "deploy" | "run" | "test"

// The primary output type (for dependencies and dependants).
export type DependencyRelations = {
  build: GardenModule[]
  deploy: GardenService[]
  run: GardenTask[]
  test: TestConfig[]
}

type DependencyRelationNames = {
  build: string[]
  deploy: string[]
  run: string[]
  test: string[]
}

export type DependencyRelationFilterFn = (node: DependencyGraphNode) => boolean

// Output types for rendering/logging
export type RenderedActionGraph = {
  nodes: RenderedNode[]
  relationships: RenderedEdge[]
}
export type RenderedEdge = { dependant: RenderedNode; dependency: RenderedNode }

export interface RenderedNode {
  type: DependencyGraphNodeType
  name: string
  moduleName: string
  key: string
  disabled: boolean
}

type DepNodeTaskTypeMap = { [key in DependencyGraphNodeType]: TaskType }

type EntityConfig = ServiceConfig | TaskConfig | TestConfig

interface EntityConfigEntry<T extends string, C extends EntityConfig> {
  type: T
  moduleKey: string
  config: C
}

export type DependencyGraph = { [key: string]: DependencyGraphNode }

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 *
 * This should be initialized with fully resolved and validated ModuleConfigs.
 */
export class ConfigGraph {
  private dependencyGraph: DependencyGraph
  private modules: { [key: string]: GardenModule }

  private serviceConfigs: {
    [key: string]: EntityConfigEntry<"service", ServiceConfig>
  }
  private taskConfigs: {
    [key: string]: EntityConfigEntry<"task", TaskConfig>
  }
  private testConfigs: {
    [key: string]: EntityConfigEntry<"test", TestConfig>
  }

  constructor(modules: GardenModule[], moduleTypes: ModuleTypeMap) {
    this.dependencyGraph = {}
    this.modules = {}
    this.serviceConfigs = {}
    this.taskConfigs = {}
    this.testConfigs = {}

    // Add nodes to graph and validate
    for (const module of modules) {
      const moduleKey = this.keyForModule(module)
      this.modules[moduleKey] = module

      // Add services
      for (const serviceConfig of module.serviceConfigs) {
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
        if (sourceModuleName) {
          module.build.dependencies.push({
            name: sourceModuleName,
            copy: [],
          })
        }

        this.serviceConfigs[serviceName] = { type: "service", moduleKey, config: serviceConfig }
      }

      // Add tasks
      for (const taskConfig of module.taskConfigs) {
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

        this.taskConfigs[taskName] = { type: "task", moduleKey, config: taskConfig }
      }
    }

    detectMissingDependencies(Object.values(this.modules))

    // Add relations between nodes
    for (const module of modules) {
      const type = moduleTypes[module.type]
      const needsBuild = moduleNeedsBuild(module, type)

      const moduleKey = this.keyForModule(module)
      this.modules[moduleKey] = module

      const addBuildDeps = (node: DependencyGraphNode) => {
        for (const buildDep of module.build.dependencies) {
          const buildDepKey = getModuleKey(buildDep.name, buildDep.plugin)
          this.addRelation({
            dependant: node,
            dependencyType: "build",
            dependencyName: buildDepKey,
            dependencyModuleName: buildDepKey,
          })
        }
      }

      if (needsBuild) {
        addBuildDeps(this.getNode("build", moduleKey, moduleKey, module.disabled))
      }

      // Service dependencies
      for (const serviceConfig of module.serviceConfigs) {
        const serviceNode = this.getNode(
          "deploy",
          serviceConfig.name,
          moduleKey,
          module.disabled || serviceConfig.disabled
        )

        if (needsBuild) {
          // The service needs its own module to be built
          this.addRelation({
            dependant: serviceNode,
            dependencyType: "build",
            dependencyName: moduleKey,
            dependencyModuleName: moduleKey,
          })
        } else {
          // No build needed for the module, but the service needs the module's build dependencies to be built (if any).
          addBuildDeps(serviceNode)
        }

        for (const depName of serviceConfig.dependencies) {
          this.addRuntimeRelation(serviceNode, depName)
        }
      }

      // Task dependencies
      for (const taskConfig of module.taskConfigs) {
        const taskNode = this.getNode("run", taskConfig.name, moduleKey, module.disabled || taskConfig.disabled)

        if (needsBuild) {
          // The task needs its own module to be built
          this.addRelation({
            dependant: taskNode,
            dependencyType: "build",
            dependencyName: moduleKey,
            dependencyModuleName: moduleKey,
          })
        } else {
          // No build needed for the module, but the task needs the module's build dependencies to be built (if any).
          addBuildDeps(taskNode)
        }

        for (const depName of taskConfig.dependencies) {
          this.addRuntimeRelation(taskNode, depName)
        }
      }

      // Test dependencies
      for (const testConfig of module.testConfigs) {
        const testConfigName = makeTestTaskName(module.name, testConfig.name)

        this.testConfigs[testConfigName] = { type: "test", moduleKey, config: testConfig }

        const testNode = this.getNode("test", testConfigName, moduleKey, module.disabled || testConfig.disabled)

        if (needsBuild) {
          // The test needs its own module to be built
          this.addRelation({
            dependant: testNode,
            dependencyType: "build",
            dependencyName: moduleKey,
            dependencyModuleName: moduleKey,
          })
        } else {
          // No build needed for the module, but the test needs the module's build dependencies to be built (if any).
          addBuildDeps(testNode)
        }

        for (const depName of testConfig.dependencies) {
          this.addRuntimeRelation(testNode, depName)
        }
      }
    }

    const validationGraph = DependencyValidationGraph.fromDependencyGraph(this.dependencyGraph)
    const cycles = validationGraph.detectCircularDependencies()

    if (cycles.length > 0) {
      const description = validationGraph.cyclesToString(cycles)
      const errMsg = `\nCircular dependencies detected: \n\n${description}\n`
      throw new ConfigurationError(errMsg, { "circular-dependencies": description })
    }
  }

  // Convenience method used in the constructor above.
  keyForModule(module: GardenModule | BuildDependencyConfig) {
    return getModuleKey(module.name, module.plugin)
  }

  private addRuntimeRelation(node: DependencyGraphNode, depName: string) {
    const dep = this.serviceConfigs[depName] || this.taskConfigs[depName]
    const depType = dep.type === "service" ? "deploy" : "run"

    this.addRelation({
      dependant: node,
      dependencyType: depType,
      dependencyName: depName,
      dependencyModuleName: dep.moduleKey,
    })
  }

  private isDisabled(dep: EntityConfigEntry<any, any>) {
    const moduleConfig = this.modules[dep.moduleKey]
    return moduleConfig.disabled || dep.config.disabled
  }

  /**
   * Returns the Service with the specified name. Throws error if it doesn't exist.
   */
  getModule(name: string, includeDisabled?: boolean): GardenModule {
    return this.getModules({ names: [name], includeDisabled })[0]
  }

  /**
   * Returns the Service with the specified name. Throws error if it doesn't exist.
   */
  getService(name: string, includeDisabled?: boolean): GardenService {
    return this.getServices({ names: [name], includeDisabled })[0]
  }

  /**
   * Returns the Task with the specified name. Throws error if it doesn't exist.
   */
  getTask(name: string, includeDisabled?: boolean): GardenTask {
    return this.getTasks({ names: [name], includeDisabled })[0]
  }

  /**
   * Returns the `testName` test from the `moduleName` module. Throws if either is not found.
   */
  getTest(moduleName: string, testName: string, includeDisabled?: boolean): GardenTest {
    const module = this.getModule(moduleName, includeDisabled)
    return testFromModule(module, testName, this)
  }

  /*
    Returns all modules defined in this configuration graph, or the ones specified.
   */
  getModules({ names, includeDisabled = false }: { names?: string[]; includeDisabled?: boolean } = {}) {
    const modules = includeDisabled ? this.modules : pickBy(this.modules, (c) => !c.disabled)
    return Object.values(names ? pickKeys(modules, names, "module") : modules)
  }

  /*
    Returns all services defined in this configuration graph, or the ones specified.
   */
  getServices({ names, includeDisabled = false }: { names?: string[]; includeDisabled?: boolean } = {}) {
    const serviceConfigs = includeDisabled
      ? this.serviceConfigs
      : pickBy(this.serviceConfigs, (s) => !this.isDisabled(s))

    const configs = Object.values(names ? pickKeys(serviceConfigs, names, "service") : serviceConfigs)

    return configs.map((c) => serviceFromConfig(this, this.getModule(c.moduleKey, true), c.config))
  }

  /*
    Returns all tasks defined in this configuration graph, or the ones specified.
   */
  getTasks({ names, includeDisabled = false }: { names?: string[]; includeDisabled?: boolean } = {}) {
    const taskConfigs = includeDisabled ? this.taskConfigs : pickBy(this.taskConfigs, (t) => !this.isDisabled(t))
    const configs = Object.values(names ? pickKeys(taskConfigs, names, "task") : taskConfigs)

    return configs.map((c) => taskFromConfig(this.getModule(c.moduleKey, true), c.config))
  }

  /**
   * Returns all tests defined in this configuration graph, or the ones specified.
   * Note that test names are not unique, so a given name can return multiple tests.
   */
  getTests({ names, includeDisabled = false }: { names?: string[]; includeDisabled?: boolean } = {}) {
    const testConfigs = includeDisabled ? this.testConfigs : pickBy(this.testConfigs, (t) => !this.isDisabled(t))

    // We need to filter by full test name, i.e <module-name>.<test-name>
    const fullTestNames = names ? Object.keys(testConfigs).filter((name) => names.includes(name.split(".")[1])) : names

    const configs = Object.values(fullTestNames ? pickKeys(testConfigs, fullTestNames, "test") : testConfigs)

    return configs.map((c) => testFromConfig(this.getModule(c.moduleKey, true), c.config, this))
  }

  /*
   * If filter is provided to any of the methods below that accept it, matching nodes
   * (and their dependencies/dependants, if recursive = true) are ignored.
   */

  /**
   * Returns the set union of modules with the set union of their dependants (across all dependency types, recursively).
   */
  withDependantModules(modules: GardenModule[]): GardenModule[] {
    const dependants = modules.flatMap((m) => this.getDependantsForModule(m, true))
    // We call getModules to ensure that the returned modules have up-to-date versions.
    const dependantModules = this.modulesForRelations(this.mergeRelations(...dependants))
    return this.getModules({ names: uniq(modules.concat(dependantModules).map((m) => m.name)), includeDisabled: true })
  }

  /**
   * Returns all build and runtime dependants of a module and its services & tasks (recursively).
   * Includes the services and tasks contained in the given module, but does _not_ contain the build node for the
   * module itself.
   */
  getDependantsForModule(module: GardenModule, recursive: boolean): DependencyRelations {
    return this.getDependants({ nodeType: "build", name: module.name, recursive })
  }

  /**
   * Returns all dependencies of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
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
    nodeType: DependencyGraphNodeType
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(this.getDependencyNodes({ nodeType, name, recursive, filter }))
  }

  /**
   * Returns all dependants of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  getDependants({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: DependencyGraphNodeType
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(this.getDependantNodes({ nodeType, name, recursive, filter }))
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
    nodeType: DependencyGraphNodeType
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(
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
    nodeType: DependencyGraphNodeType
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(flatten(names.map((name) => this.getDependantNodes({ nodeType, name, recursive, filter }))))
  }

  /**
   * Returns the set union for each node type across relationArr (i.e. concatenates and deduplicates for each key).
   */
  mergeRelations(...relationArr: DependencyRelations[]): DependencyRelations {
    const names = {}
    for (const type of ["build", "run", "deploy", "test"]) {
      names[type] = uniqByName(flatten(relationArr.map((r) => r[type]))).map((r) => r.name)
    }

    return this.relationsFromNames({
      build: names["build"],
      deploy: names["deploy"],
      run: names["run"],
      test: names["test"],
    })
  }

  /**
   * Returns the (unique by name) list of modules represented in relations.
   */
  private modulesForRelations(relations: DependencyRelations): GardenModule[] {
    const moduleNames = uniq(
      flatten([
        relations.build,
        relations.deploy.map((s) => s.module),
        relations.run.map((w) => w.module),
        this.getModules({ names: relations.test.map((t) => this.testConfigs[t.name].moduleKey) }),
      ]).map((m) => m.name)
    )
    // We call getModules to ensure that the returned modules have up-to-date versions.
    return this.getModules({ names: moduleNames, includeDisabled: true })
  }

  /**
   * Given the provided lists of build and runtime (service/task) dependencies, return a list of all
   * modules required to satisfy those dependencies.
   */
  resolveDependencyModules(buildDependencies: BuildDependencyConfig[], runtimeDependencies: string[]): GardenModule[] {
    const moduleNames = buildDependencies.map((d) => getModuleKey(d.name, d.plugin))
    const serviceNames = runtimeDependencies.filter(
      (d) => this.serviceConfigs[d] && !this.isDisabled(this.serviceConfigs[d])
    )
    const taskNames = runtimeDependencies.filter((d) => this.taskConfigs[d] && !this.isDisabled(this.taskConfigs[d]))

    const buildDeps = this.getDependenciesForMany({ nodeType: "build", names: moduleNames, recursive: true })
    const serviceDeps = this.getDependenciesForMany({ nodeType: "deploy", names: serviceNames, recursive: true })
    const taskDeps = this.getDependenciesForMany({ nodeType: "run", names: taskNames, recursive: true })

    const modules = [
      ...this.getModules({ names: moduleNames, includeDisabled: true }),
      ...this.modulesForRelations(this.mergeRelations(buildDeps, serviceDeps, taskDeps)),
    ]

    return sortBy(uniqByName(modules), "name")
  }

  private toRelations(nodes: DependencyGraphNode[]): DependencyRelations {
    return this.relationsFromNames({
      build: this.uniqueNames(nodes, "build"),
      deploy: this.uniqueNames(nodes, "deploy"),
      run: this.uniqueNames(nodes, "run"),
      test: this.uniqueNames(nodes, "test"),
    })
  }

  private relationsFromNames(names: DependencyRelationNames): DependencyRelations {
    return {
      build: this.getModules({ names: names.build, includeDisabled: true }),
      deploy: this.getServices({ names: names.deploy, includeDisabled: true }),
      run: this.getTasks({ names: names.run, includeDisabled: true }),
      test: Object.values(pick(this.testConfigs, names.test)).map((t) => t.config),
    }
  }

  private getDependencyNodes({
    nodeType,
    name,
    recursive,
    filter,
  }: {
    nodeType: DependencyGraphNodeType
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
    nodeType: DependencyGraphNodeType
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(nodeType, name)]
    return node ? node.getDependants(recursive, filter) : []
  }

  private uniqueNames(nodes: DependencyGraphNode[], type: DependencyGraphNodeType) {
    return uniq(nodes.filter((n) => n.type === type).map((n) => n.name))
  }

  // Idempotent.
  private addRelation({
    dependant,
    dependencyType,
    dependencyName,
    dependencyModuleName,
  }: {
    dependant: DependencyGraphNode
    dependencyType: DependencyGraphNodeType
    dependencyName: string
    dependencyModuleName: string
  }) {
    const dependency = this.getNode(dependencyType, dependencyName, dependencyModuleName, false)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }

  // Idempotent.
  private getNode(type: DependencyGraphNodeType, name: string, moduleName: string, disabled: boolean) {
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

const depNodeTaskTypeMap: DepNodeTaskTypeMap = {
  build: "build",
  deploy: "deploy",
  run: "task",
  test: "test",
}

interface DependencyGraphEdge {
  dependant: DependencyGraphNode
  dependency: DependencyGraphNode
}

export class DependencyGraphNode {
  dependencies: DependencyGraphNode[]
  dependants: DependencyGraphNode[]

  constructor(
    public type: DependencyGraphNodeType,
    public name: string,
    public moduleName: string,
    public disabled: boolean
  ) {
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    const name = this.type === "test" ? parseTestKey(this.name).testName : this.name
    const taskType = <TaskType>depNodeTaskTypeMap[this.type]

    return {
      name,
      type: this.type,
      moduleName: this.moduleName,
      key: makeBaseKey(taskType, this.name),
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

/**
 * Note: If type === "build", name should be a prefix-qualified module name, as
 * returned by keyForModule or getModuleKey.
 */
export function nodeKey(type: DependencyGraphNodeType, name: string) {
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
