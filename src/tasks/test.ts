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
import { Module, TestSpec } from "../types/module"
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin"
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
  testSpec: TestSpec
  force: boolean
  forceBuild: boolean
}

export class TestTask extends Task {
  type = "test"

  private ctx: PluginContext
  private module: Module
  private testSpec: TestSpec
  private force: boolean
  private forceBuild: boolean

  constructor(initArgs: TestTaskParams & TaskVersion) {
    super(initArgs)
    this.ctx = initArgs.ctx
    this.module = initArgs.module
    this.testSpec = initArgs.testSpec
    this.force = initArgs.force
    this.forceBuild = initArgs.forceBuild
  }

  static async factory(initArgs: TestTaskParams): Promise<TestTask> {
    initArgs.version = await initArgs.module.getVersion()
    return new TestTask(<TestTaskParams & TaskVersion>initArgs)
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const services = await this.ctx.getServices(this.testSpec.dependencies)

    const deps: Promise<Task>[] = [BuildTask.factory({
      ctx: this.ctx, module: this.module,
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
    return `${this.module.name}.${this.testSpec.name}`
  }

  getDescription() {
    return `running ${this.testSpec.name} tests in module ${this.module.name}`
  }

  async process(): Promise<TestResult> {
    if (!this.force) {
      // find out if module has already been tested
      const testResult = await this.getTestResult()

      if (testResult && testResult.success) {
        const passedEntry = this.ctx.log.info({
          section: this.module.name,
          msg: `${this.testSpec.name} tests`,
        })
        passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
        return testResult
      }
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: `Running ${this.testSpec.name} tests`,
      entryStyle: EntryStyle.activity,
    })

    const dependencies = await this.ctx.getServices(this.testSpec.dependencies)
    const runtimeContext = await this.module.prepareRuntimeContext(dependencies)

    const result = await this.ctx.testModule({
      interactive: false,
      module: this.module,
      runtimeContext,
      silent: true,
      testSpec: this.testSpec,
    })

    if (result.success) {
      entry.setSuccess({ msg: chalk.green(`Success`), append: true })
    } else {
      entry.setError({ msg: chalk.red(`Failed!`), append: true })
      throw new TestError(result.output)
    }

    return result
  }

  async getTestResult() {
    if (this.force) {
      return null
    }

    const testResult = await this.ctx.getTestResult(this.module, this.testSpec.name, await this.module.getVersion())
    return testResult && testResult.success && testResult
  }
}
