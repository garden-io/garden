/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, pick, uniq, sortBy, pickBy } from "lodash-es"
import type { BuildDependencyConfig, ModuleConfig } from "../config/module.js"
import type { GardenModule, ModuleTypeMap } from "../types/module.js"
import { moduleNeedsBuild } from "../types/module.js"
import type { GardenService } from "../types/service.js"
import { serviceFromConfig } from "../types/service.js"
import type { GardenTask } from "../types/task.js"
import { taskFromConfig } from "../types/task.js"
import type { TestConfig } from "../config/test.js"
import { uniqByName, pickKeys } from "../util/util.js"
import { CircularDependenciesError, ConfigurationError } from "../exceptions.js"
import { dedent, deline, naturalList } from "../util/string.js"
import { DependencyGraph } from "./common.js"
import type { ServiceConfig } from "../config/service.js"
import type { TaskConfig } from "../config/task.js"
import { makeBaseKey } from "../tasks/base.js"
import type { GardenTest } from "../types/test.js"
import { testFromModule, testFromConfig } from "../types/test.js"
import indentString from "indent-string"

// Each of these types corresponds to a Task class (e.g. BuildTask, DeployTask, ...).
export type ModuleDependencyGraphNodeKind = "build" | "deploy" | "run" | "test"

// The primary output type (for dependencies and dependants).
type DependencyRelations = {
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

type DependencyRelationFilterFn = (node: ModuleDependencyGraphNode) => boolean

interface RenderedNode {
  type: ModuleDependencyGraphNodeKind
  name: string
  moduleName: string
  key: string
  disabled: boolean
}

type DepNodeTaskKindMap = { [key in ModuleDependencyGraphNodeKind]: string }

type EntityConfig = ServiceConfig | TaskConfig | TestConfig

interface EntityConfigEntry<T extends string, C extends EntityConfig> {
  type: T
  moduleKey: string
  config: C
}

export interface GetManyParams {
  names?: string[]
  includeDisabled?: boolean
}

export type ModuleGraphNodes = { [key: string]: ModuleDependencyGraphNode }

/**
 * A graph data structure that facilitates querying (recursive or non-recursive) of the project's dependency and
 * dependant relationships.
 *
 * This should be initialized with resolved and validated GardenModules.
 */
export class ModuleGraph {
  private dependencyGraph: ModuleGraphNodes
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

  constructor({
    modules,
    moduleTypes,
    skippedKeys,
  }: {
    modules: GardenModule[]
    moduleTypes: ModuleTypeMap
    skippedKeys?: Set<string>
  }) {
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

          throw new ConfigurationError({
            message: deline`
            Service names must be unique - the service name '${serviceName}' is declared multiple times
            (in modules '${moduleA}' and '${moduleB}')`,
          })
        }

        // Make sure service source modules are added as build dependencies for the module
        const { sourceModuleName } = serviceConfig
        if (sourceModuleName) {
          module.build.dependencies.push({
            name: sourceModuleName,
            copy: [],
          })
        }

        if (skippedKeys?.has(`deploy.${serviceName}`)) {
          continue
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

          throw new ConfigurationError({
            message: deline`
            Task names must be unique - the task name '${taskName}' is declared multiple times (in modules
            '${moduleA}' and '${moduleB}')`,
          })
        }

        if (skippedKeys?.has(`run.${taskName}`)) {
          continue
        }

        this.taskConfigs[taskName] = { type: "task", moduleKey, config: taskConfig }
      }
    }

    detectMissingDependencies(Object.values(this.modules), skippedKeys)

    // Add relations between nodes
    for (const module of modules) {
      const type = moduleTypes[module.type]
      const needsBuild = moduleNeedsBuild(module, type)

      const moduleKey = this.keyForModule(module)
      this.modules[moduleKey] = module

      const addBuildDeps = (node: ModuleDependencyGraphNode) => {
        for (const buildDep of module.build.dependencies) {
          const buildDepKey = buildDep.name
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
        if (skippedKeys?.has(`deploy.${serviceConfig.name}`)) {
          continue
        }

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
        if (skippedKeys?.has(`run.${taskConfig.name}`)) {
          continue
        }

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
        if (skippedKeys?.has(`test.${module.name}-${testConfig.name}`)) {
          continue
        }

        const testConfigName = module.name + "." + testConfig.name

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

    const validationGraph = DependencyGraph.fromGraphNodes(this.dependencyGraph)
    const cycles = validationGraph.detectCircularDependencies()

    if (cycles.length > 0) {
      const cyclesSummary = validationGraph.cyclesToString(cycles)
      throw new CircularDependenciesError({
        messagePrefix: "Circular dependencies detected",
        cycles,
        cyclesSummary,
      })
    }
  }

  // Convenience method used in the constructor above.
  keyForModule(module: GardenModule | BuildDependencyConfig) {
    return module.name
  }

  private addRuntimeRelation(node: ModuleDependencyGraphNode, depName: string) {
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
  getModules({ names, includeDisabled = false }: GetManyParams = {}) {
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
    return this.getDependants({ kind: "build", name: module.name, recursive })
  }

  /**
   * Returns all dependencies of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
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
    kind: ModuleDependencyGraphNodeKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(this.getDependencyNodes({ kind, name, recursive, filter }))
  }

  /**
   * Returns all dependants of a node in the graph. As noted above, each DependencyGraphNodeType corresponds
   * to a Task class (e.g. BuildTask, DeployTask, ...), and name corresponds to the value returned by its getName
   * instance method.
   *
   * If recursive = true, also includes those dependants' dependants, etc.
   */
  getDependants({
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ModuleDependencyGraphNodeKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(this.getDependantNodes({ kind, name, recursive, filter }))
  }

  /**
   * Same as getDependencies above, but returns the set union of the dependencies of the nodes in the graph
   * having type = kind and name = name (computed recursively or shallowly for all).
   */
  getDependenciesForMany({
    kind,
    names,
    recursive,
    filter,
  }: {
    kind: ModuleDependencyGraphNodeKind
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(flatten(names.map((name) => this.getDependencyNodes({ kind, name, recursive, filter }))))
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
    kind: ModuleDependencyGraphNodeKind
    names: string[]
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): DependencyRelations {
    return this.toRelations(flatten(names.map((name) => this.getDependantNodes({ kind, name, recursive, filter }))))
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
    const moduleNames = buildDependencies.map((d) => d.name)
    const serviceNames = runtimeDependencies.filter(
      (d) => this.serviceConfigs[d] && !this.isDisabled(this.serviceConfigs[d])
    )
    const taskNames = runtimeDependencies.filter((d) => this.taskConfigs[d] && !this.isDisabled(this.taskConfigs[d]))

    const buildDeps = this.getDependenciesForMany({ kind: "build", names: moduleNames, recursive: true })
    const serviceDeps = this.getDependenciesForMany({ kind: "deploy", names: serviceNames, recursive: true })
    const taskDeps = this.getDependenciesForMany({ kind: "run", names: taskNames, recursive: true })

    const modules = [
      ...this.getModules({ names: moduleNames, includeDisabled: true }),
      ...this.modulesForRelations(this.mergeRelations(buildDeps, serviceDeps, taskDeps)),
    ]

    return sortBy(uniqByName(modules), "name")
  }

  private toRelations(nodes: ModuleDependencyGraphNode[]): DependencyRelations {
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
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ModuleDependencyGraphNodeKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): ModuleDependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(kind, name)]
    return node ? node.getDependencies(recursive, filter) : []
  }

  private getDependantNodes({
    kind,
    name,
    recursive,
    filter,
  }: {
    kind: ModuleDependencyGraphNodeKind
    name: string
    recursive: boolean
    filter?: DependencyRelationFilterFn
  }): ModuleDependencyGraphNode[] {
    const node = this.dependencyGraph[nodeKey(kind, name)]
    return node ? node.getDependants(recursive, filter) : []
  }

  private uniqueNames(nodes: ModuleDependencyGraphNode[], type: ModuleDependencyGraphNodeKind) {
    return uniq(nodes.filter((n) => n.kind === type).map((n) => n.name))
  }

  // Idempotent.
  private addRelation({
    dependant,
    dependencyType,
    dependencyName,
    dependencyModuleName,
  }: {
    dependant: ModuleDependencyGraphNode
    dependencyType: ModuleDependencyGraphNodeKind
    dependencyName: string
    dependencyModuleName: string
  }) {
    const dependency = this.getNode(dependencyType, dependencyName, dependencyModuleName, false)
    dependant.addDependency(dependency)
    dependency.addDependant(dependant)
  }

  // Idempotent.
  private getNode(type: ModuleDependencyGraphNodeKind, name: string, moduleName: string, disabled: boolean) {
    const key = nodeKey(type, name)
    const existingNode = this.dependencyGraph[key]
    if (existingNode) {
      if (disabled) {
        existingNode.disabled = true
      }
      return existingNode
    } else {
      const newNode = new ModuleDependencyGraphNode(type, name, moduleName, disabled)
      this.dependencyGraph[key] = newNode
      return newNode
    }
  }
}

const depNodeTaskTypeMap: DepNodeTaskKindMap = {
  build: "build",
  deploy: "deploy",
  run: "run",
  test: "test",
}

export class ModuleDependencyGraphNode {
  dependencies: ModuleDependencyGraphNode[]
  dependants: ModuleDependencyGraphNode[]

  constructor(
    public kind: ModuleDependencyGraphNodeKind,
    public name: string,
    public moduleName: string,
    public disabled: boolean
  ) {
    this.dependencies = []
    this.dependants = []
  }

  render(): RenderedNode {
    const name = this.kind === "test" ? parseTestKey(this.name).testName : this.name
    const taskType = depNodeTaskTypeMap[this.kind]

    return {
      name,
      type: this.kind,
      moduleName: this.moduleName,
      key: makeBaseKey(taskType, this.name),
      disabled: this.disabled,
    }
  }

  // Idempotent.
  addDependency(node: ModuleDependencyGraphNode) {
    const key = nodeKey(node.kind, node.name)
    if (!this.dependencies.find((d) => nodeKey(d.kind, d.name) === key)) {
      this.dependencies.push(node)
    }
  }

  // Idempotent.
  addDependant(node: ModuleDependencyGraphNode) {
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
      if (n.kind !== "build" && n.disabled) {
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
 * Looks for dependencies on non-existent modules, services or tasks, and throws a ConfigurationError
 * if any were found.
 */
export function detectMissingDependencies(moduleConfigs: ModuleConfig[], skippedKeys?: Set<string>) {
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
    const buildDepKeys = m.build.dependencies.map((d) => d.name)

    for (const missingModule of buildDepKeys.filter((k) => !moduleNames.has(k))) {
      missingDepDescriptions.push(
        `Module '${m.name}': Unknown module '${missingModule}' referenced in build dependencies.`
      )
    }

    for (const [configKey, entityName] of runtimeDepTypes) {
      for (const config of m[configKey]) {
        for (const missingRuntimeDep of config.dependencies.filter((d: string) => !runtimeNames.has(d))) {
          if (skippedKeys?.has(`deploy.${missingRuntimeDep}`) || skippedKeys?.has(`run.${missingRuntimeDep}`)) {
            // Don't flag missing dependencies that are explicitly skipped during resolution
            continue
          }
          missingDepDescriptions.push(deline`
            ${entityName} '${config.name}' (in module '${m.name}'): Unknown service or task '${missingRuntimeDep}'
            referenced in dependencies.`)
        }
      }
    }
  }

  if (missingDepDescriptions.length > 0) {
    const errMsg = "Unknown dependencies detected.\n\n" + indentString(missingDepDescriptions.join("\n\n"), 2) + "\n"

    throw new ConfigurationError({
      message: dedent`
        ${errMsg}

        Available modules: ${naturalList(Array.from(moduleNames))}
        Available services and tasks: ${naturalList(Array.from(runtimeNames))}
        `,
    })
  }
}

/**
 * Note: If kind === "build", name should be a prefix-qualified module name, as
 * returned by keyForModule or getModuleKey.
 */
export function nodeKey(kind: ModuleDependencyGraphNodeKind, name: string) {
  return `${kind}.${name}`
}

function parseTestKey(key: string) {
  const [moduleName, testName] = key.split(".")
  return { moduleName, testName }
}

function serviceTaskConflict(conflictingName: string, moduleWithTask: string, moduleWithService: string) {
  return new ConfigurationError({
    message: deline`
    Service and task names must be mutually unique - the name '${conflictingName}' is used for a task in
    '${moduleWithTask}' and for a service in '${moduleWithService}'`,
  })
}
