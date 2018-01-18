import { Task } from "../task-graph"
import { GardenContext } from "../context"
import { BuildTask } from "./build"
import { values } from "lodash"
import { Service } from "../types/service"

export class DeployTask extends Task {
  type = "deploy"

  constructor(
    private ctx: GardenContext,
    private service: Service<any>,
    private force: boolean,
    private forceBuild: boolean) {
    super()
  }

  async getDependencies() {
    const serviceDeps = this.service.module.config.services[this.service.name].dependencies
    const services = await this.ctx.getServices(serviceDeps)
    const deps: Task[] = values(services).map((s) => {
      return new DeployTask(this.ctx, s, this.force, this.forceBuild)
    })

    deps.push(new BuildTask(this.service.module, this.forceBuild))
    return deps
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.service.name
  }

  async process() {
    // TODO: get version from build task results
    const version = await this.service.module.getVersion()
    const status = await this.ctx.getServiceStatus(this.service)

    if (
      version === status.version &&
      status.state === "ready"
    ) {
      // already deployed and ready
      this.ctx.log.verbose(this.service.name, `Version ${version} already deployed`)
      return status
    }

    return this.ctx.deployService(this.service)
  }
}
