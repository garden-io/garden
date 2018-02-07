import { Task } from "../task-graph"
import { Module, TestSpec } from "../types/module"
import { BuildTask } from "./build"
import { TestResult } from "../types/plugin"
import { DeployTask } from "./deploy"
import { GardenContext } from "../context"
import { EntryStyle } from "../log"
import chalk from "chalk"

export class TestTask extends Task {
  type = "test"

  constructor(
    private ctx: GardenContext,
    private module: Module, private testType: string, private testSpec: TestSpec,
    private force: boolean, private forceBuild: boolean,
  ) {
    super()
  }

  async getDependencies() {
    const deps: Task[] = [new BuildTask(this.ctx, this.module, this.forceBuild)]

    const services = await this.ctx.getServices(this.testSpec.dependencies)

    for (const serviceName in services) {
      const service = services[serviceName]
      deps.push(new DeployTask(this.ctx, service, false, this.forceBuild))
    }

    return deps
  }

  getKey() {
    return `${this.module.name}.${this.testType}`
  }

  async process(): Promise<TestResult> {
    // TODO: find out if module has already been tested
    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: `Running ${this.testType} tests`,
      entryStyle: EntryStyle.activity,
    })

    // TODO: the force parameters has no use because we don't track which tests have been run
    this.force

    const result = await this.ctx.testModule(this.module, this.testSpec)

    if (result.success) {
      entry.success({ msg: chalk.green(`Success`) })
    } else {
      entry.error({ msg: chalk.red(`Failed!`) })
    }

    return result
  }
}
