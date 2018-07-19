/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import chalk from "chalk"
import { PluginContext } from "../plugin-context"
import { Module } from "../types/module"
import { TestConfig } from "../types/test"
import { getNames } from "../util/util"
import { ModuleVersion } from "../vcs/base"
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin/outputs"
import { Task, TaskParams, TaskVersion } from "../types/task"
import { EntryStyle } from "../logger/types"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export interface TestTaskParams extends TaskParams {
  ctx: PluginContext
  module: Module
  testConfig: TestConfig
  force: boolean
  forceBuild: boolean
}

export class TestTask extends Task {
  type = "test"

  private ctx: PluginContext
  private module: Module
  private testConfig: TestConfig
  private force: boolean
  private forceBuild: boolean

  constructor(initArgs: TestTaskParams & TaskVersion) {
    super(initArgs)
    this.ctx = initArgs.ctx
    this.module = initArgs.module
    this.testConfig = initArgs.testConfig
    this.force = initArgs.force
    this.forceBuild = initArgs.forceBuild
  }

  static async factory(initArgs: TestTaskParams): Promise<TestTask> {
    const { ctx, module, testConfig } = initArgs
    initArgs.version = await getTestVersion(ctx, module, testConfig)
    return new TestTask(<TestTaskParams & TaskVersion>initArgs)
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const services = await this.ctx.getServices(this.testConfig.dependencies)

    const deps: Promise<Task>[] = [BuildTask.factory({
      ctx: this.ctx,
      module: this.module,
      force: this.forceBuild,
    })]

    for (const service of services) {
      deps.push(DeployTask.factory({
        service,
        ctx: this.ctx,
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
      const passedEntry = this.ctx.log.info({
        section: this.module.name,
        msg: `${this.testConfig.name} tests`,
      })
      passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
      return testResult
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: `Running ${this.testConfig.name} tests`,
      entryStyle: EntryStyle.activity,
    })

    const dependencies = await getTestDependencies(this.ctx, this.testConfig)
    const runtimeContext = await this.module.prepareRuntimeContext(dependencies)

    const result = await this.ctx.testModule({
      interactive: false,
      moduleName: this.module.name,
      runtimeContext,
      silent: true,
      testConfig: this.testConfig,
    })

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

    return this.ctx.getTestResult({
      moduleName: this.module.name,
      testName: this.testConfig.name,
      version: this.version,
    })
  }
}

async function getTestDependencies(ctx: PluginContext, testConfig: TestConfig) {
  return ctx.getServices(testConfig.dependencies)
}

/**
 * Determine the version of the test run, based on the version of the module and each of its dependencies.
 */
async function getTestVersion(ctx: PluginContext, module: Module, testConfig: TestConfig): Promise<ModuleVersion> {
  const buildDeps = await module.getBuildDependencies()
  const moduleDeps = await ctx.resolveModuleDependencies(getNames(buildDeps), testConfig.dependencies)
  return ctx.resolveVersion(module.name, getNames(moduleDeps))
}
