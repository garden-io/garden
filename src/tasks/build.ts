import { Task } from "../task-graph"
import { Module } from "../types/module"
import { GardenContext } from "../context"
import { EntryStyle } from "../log"
import chalk from "chalk"

export class BuildTask extends Task {
  type = "build"

  constructor(private ctx: GardenContext, private module: Module, private force: boolean) {
    super()
  }

  async getDependencies() {
    const deps = await this.module.getBuildDependencies()
    return deps.map((m: Module) => new BuildTask(this.ctx, m, this.force))
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.module.name
  }

  async process() {
    const entry = this.ctx.log.info({
      section: this.module.name,
      msg: "Building",
      entryStyle: EntryStyle.activity,
    })

    if (this.force || !(await this.module.getBuildStatus()).ready) {
      const result = await this.module.build()
      entry.success({ msg: chalk.green("Done") })
      return result
    } else {
      entry.success({ msg: "Already built" })
      return { fresh: false }
    }
  }
}
