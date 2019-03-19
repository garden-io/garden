/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { Module } from "../types/module"
import { TestConfig } from "../config/test"
import { ModuleVersion } from "../vcs/base"
import { PushTask } from "./push"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin/outputs"
import { BaseTask, TaskParams } from "../tasks/base"
import { prepareRuntimeContext } from "../types/service"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { DependencyGraphNodeType, ConfigGraph } from "../config-graph"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  module: Module
  testConfig: TestConfig
  force: boolean
  forceBuild: boolean
}

export class TestTask extends BaseTask {
  type = "test"
  depType: DependencyGraphNodeType = "test"

  private module: Module
  private graph: ConfigGraph
  private testConfig: TestConfig
  private forceBuild: boolean

  constructor({ garden, graph, log, module, testConfig, force, forceBuild, version }: TestTaskParams & TaskParams) {
    super({ garden, log, force, version })
    this.module = module
    this.graph = graph
    this.testConfig = testConfig
    this.force = force
    this.forceBuild = forceBuild
  }

  static async factory(initArgs: TestTaskParams): Promise<TestTask> {
    const { garden, graph, module, testConfig } = initArgs
    const version = await getTestVersion(garden, graph, module, testConfig)
    return new TestTask({ ...initArgs, version })
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const dg = this.graph
    const services = (await dg.getDependencies(this.depType, this.getName(), false)).service

    const deps: BaseTask[] = [new PushTask({
      garden: this.garden,
      log: this.log,
      module: this.module,
      force: this.forceBuild,
    })]

    for (const service of services) {
      deps.push(new DeployTask({
        garden: this.garden,
        graph: this.graph,
        log: this.log,
        service,
        force: false,
        forceBuild: this.forceBuild,
      }))
    }

    return Bluebird.all(deps)
  }

  getName() {
    return `${this.module.name}.${this.testConfig.name}`
  }

  getDescription() {
    return `running ${this.testConfig.name} tests in module ${this.module.name}`
  }

  async process(): Promise<TestResult> {
    // find out if module has already been tested
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      const passedEntry = this.log.info({
        section: this.module.name,
        msg: `${this.testConfig.name} tests`,
      })
      passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
      return testResult
    }

    const log = this.log.info({
      section: this.module.name,
      msg: `Running ${this.testConfig.name} tests`,
      status: "active",
    })

    const dependencies = await getTestDependencies(this.graph, this.testConfig)
    const runtimeContext = await prepareRuntimeContext(this.garden, this.graph, this.module, dependencies)

    let result: TestResult
    try {
      result = await this.garden.actions.testModule({
        log,
        interactive: false,
        module: this.module,
        runtimeContext,
        silent: true,
        testConfig: this.testConfig,
      })
    } catch (err) {
      log.setError()
      throw err
    }
    if (result.success) {
      log.setSuccess({ msg: chalk.green(`Success (took ${log.getDuration(1)} sec)`), append: true })
    } else {
      log.setError({ msg: chalk.red(`Failed! (took ${log.getDuration(1)} sec)`), append: true })
      throw new TestError(result.output)
    }

    return result
  }

  private async getTestResult() {
    if (this.force) {
      return null
    }

    return this.garden.actions.getTestResult({
      log: this.log,
      module: this.module,
      testName: this.testConfig.name,
      version: this.version,
    })
  }
}

export async function getTestTasks(
  { garden, log, graph, module, name, force = false, forceBuild = false }:
    {
      garden: Garden,
      log: LogEntry,
      graph: ConfigGraph,
      module: Module,
      name?: string,
      force?: boolean,
      forceBuild?: boolean,
    },
) {
  const configs = module.testConfigs.filter(test => !name || test.name === name)

  return Bluebird.map(configs, test => TestTask.factory({
    garden,
    graph,
    log,
    force,
    forceBuild,
    testConfig: test,
    module,
  }))
}

async function getTestDependencies(graph: ConfigGraph, testConfig: TestConfig) {
  const deps = await graph.getDependencies("test", testConfig.name, false)
  return deps.service
}

/**
 * Determine the version of the test run, based on the version of the module and each of its dependencies.
 */
async function getTestVersion(
  garden: Garden, graph: ConfigGraph, module: Module, testConfig: TestConfig,
): Promise<ModuleVersion> {
  const moduleDeps = await graph.resolveDependencyModules(module.build.dependencies, testConfig.dependencies)
  return garden.resolveVersion(module.name, moduleDeps)
}
