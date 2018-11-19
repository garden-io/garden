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
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin/outputs"
import { BaseTask, TaskParams } from "../tasks/base"
import { prepareRuntimeContext } from "../types/service"
import { Garden } from "../garden"
import { DependencyGraphNodeType } from "../dependency-graph"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams {
  garden: Garden
  module: Module
  testConfig: TestConfig
  force: boolean
  forceBuild: boolean
}

export class TestTask extends BaseTask {
  type = "test"
  depType: DependencyGraphNodeType = "test"

  private module: Module
  private testConfig: TestConfig
  private forceBuild: boolean

  constructor({ garden, module, testConfig, force, forceBuild, version }: TestTaskParams & TaskParams) {
    super({ garden, force, version })
    this.module = module
    this.testConfig = testConfig
    this.force = force
    this.forceBuild = forceBuild
  }

  static async factory(initArgs: TestTaskParams): Promise<TestTask> {
    const { garden, module, testConfig } = initArgs
    const version = await getTestVersion(garden, module, testConfig)
    return new TestTask({ ...initArgs, version })
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const dg = await this.garden.getDependencyGraph()
    const services = (await dg.getDependencies(this.depType, this.getName(), false)).service

    const deps: BaseTask[] = [new BuildTask({
      garden: this.garden,
      module: this.module,
      force: this.forceBuild,
    })]

    for (const service of services) {
      deps.push(new DeployTask({
        garden: this.garden,
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
      const passedEntry = this.garden.log.info({
        section: this.module.name,
        msg: `${this.testConfig.name} tests`,
      })
      passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
      return testResult
    }

    const entry = this.garden.log.info({
      section: this.module.name,
      msg: `Running ${this.testConfig.name} tests`,
      status: "active",
    })

    const dependencies = await getTestDependencies(this.garden, this.testConfig)
    const runtimeContext = await prepareRuntimeContext(this.garden, this.module, dependencies)

    let result: TestResult
    try {
      result = await this.garden.actions.testModule({
        interactive: false,
        module: this.module,
        runtimeContext,
        silent: true,
        testConfig: this.testConfig,
      })
    } catch (err) {
      entry.setError()
      throw err
    }
    if (result.success) {
      entry.setSuccess({ msg: chalk.green(`Success`), append: true })
    } else {
      entry.setError({ msg: chalk.red(`Failed!`), append: true })
      throw new TestError(result.output)
    }

    return result
  }

  private async getTestResult() {
    if (this.force) {
      return null
    }

    return this.garden.actions.getTestResult({
      module: this.module,
      testName: this.testConfig.name,
      version: this.version,
    })
  }
}

export async function getTestTasks(
  { garden, module, name, force = false, forceBuild = false }:
    { garden: Garden, module: Module, name?: string, force?: boolean, forceBuild?: boolean },
) {
  const tasks: Promise<TestTask>[] = []

  for (const test of module.testConfigs) {
    if (name && test.name !== name) {
      continue
    }
    tasks.push(TestTask.factory({
      garden,
      force,
      forceBuild,
      testConfig: test,
      module,
    }))
  }

  return Bluebird.all(tasks)
}

async function getTestDependencies(garden: Garden, testConfig: TestConfig) {
  return garden.getServices(testConfig.dependencies)
}

/**
 * Determine the version of the test run, based on the version of the module and each of its dependencies.
 */
async function getTestVersion(garden: Garden, module: Module, testConfig: TestConfig): Promise<ModuleVersion> {
  const moduleDeps = await garden.resolveDependencyModules(module.build.dependencies, testConfig.dependencies)
  return garden.resolveVersion(module.name, moduleDeps)
}
