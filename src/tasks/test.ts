/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { Module, TestSpec } from "../types/module"
import { BuildTask } from "./build"
import { DeployTask } from "./deploy"
import { TestResult } from "../types/plugin"
import { Task } from "../types/task"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"
import { values } from "lodash"

class TestError extends Error {
  toString() {
    return this.message
  }
}

export class TestTask<T extends Module> extends Task {
  type = "test"

  constructor(
    private ctx: PluginContext,
    private module: T, private testName: string, private testSpec: TestSpec,
    private force: boolean, private forceBuild: boolean,
  ) {
    super()
  }

  async getDependencies() {
    const testResult = await this.getTestResult()

    if (testResult && testResult.success) {
      return []
    }

    const deps: Task[] = [new BuildTask(this.ctx, this.module, this.forceBuild)]

    const services = await this.ctx.getServices(this.testSpec.dependencies)

    for (const serviceName of Object.keys(services)) {
      const service = services[serviceName]
      deps.push(new DeployTask(this.ctx, service, false, this.forceBuild))
    }

    return deps
  }

  getName() {
    return `${this.module.name}.${this.testName}`
  }

  getDescription() {
    return `running ${this.testName} tests in module ${this.module.name}`
  }

  async process(): Promise<TestResult> {
    if (!this.force) {
      // find out if module has already been tested
      const testResult = await this.getTestResult()

      if (testResult && testResult.success) {
        const passedEntry = this.ctx.log.info({
          section: this.module.name,
          msg: `${this.testName} tests`,
        })
        passedEntry.setSuccess({ msg: chalk.green("Already passed"), append: true })
        return testResult
      }
    }

    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: `Running ${this.testName} tests`,
      entryStyle: EntryStyle.activity,
    })

    const dependencies = values(await this.ctx.getServices(this.testSpec.dependencies))
    const runtimeContext = await this.module.prepareRuntimeContext(dependencies)

    const result = await this.ctx.testModule(this.module, this.testName, this.testSpec, runtimeContext)

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

    const testResult = await this.ctx.getTestResult(this.module, this.testName, await this.module.getVersion())
    return testResult && testResult.success && testResult
  }
}
