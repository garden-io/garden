import { Task } from "../task-graph"
import { ModuleHandler } from "../moduleHandlers/base"

export class BuildTask extends Task {
  type = "build"

  constructor(private module: ModuleHandler, private force: boolean) {
    super()

    for (const dep of module.buildDependencies) {
      this.dependencies.push(new BuildTask(dep, force))
    }
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.module.name
  }

  async process() {
    if (this.force || !(await this.module.isBuilt())) {
      return await this.module.build({ force: this.force })
    } else {
      return { fresh: false }
    }
  }
}
