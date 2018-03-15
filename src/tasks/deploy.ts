import { Task } from "../task-graph"
import { GardenContext } from "../context"
import { BuildTask } from "./build"
import { values } from "lodash"
import { Service } from "../types/service"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"

export class DeployTask<T extends Service<any>> extends Task {
  type = "deploy"

  constructor(
    private ctx: GardenContext,
    private service: T,
    private force: boolean,
    private forceBuild: boolean) {
    super()
  }

  async getDependencies() {
    const serviceDeps = this.service.config.dependencies
    const services = await this.ctx.getServices(serviceDeps)
    const deps: Task[] = values(services).map((s) => {
      return new DeployTask(this.ctx, s, this.force, this.forceBuild)
    })

    deps.push(new BuildTask(this.ctx, this.service.module, this.forceBuild))
    return deps
  }

  getKey() {
    // TODO: Include version in the task key (may need to make this method async).
    return this.service.name
  }

  async process() {
    const entry = this.ctx.log.info({
      section: this.service.name,
      msg: "Checking status",
      entryStyle: EntryStyle.activity,
    })

    // we resolve the config again because context may have changed after dependencies are deployed
    const serviceContext = await this.service.prepareContext()
    const service = await this.service.resolveConfig(serviceContext)

    // TODO: get version from build task results
    const version = await this.service.module.getVersion()
    const status = await this.ctx.getServiceStatus(service)

    entry.setState({ section: this.service.name, msg: "Deploying" })

    if (
      !this.force &&
      version === status.version &&
      status.state === "ready"
    ) {
      // already deployed and ready
      entry.setSuccess({
        msg: `Version ${version} already deployed`,
        append: true,
      })
      return status
    }

    const result = await this.ctx.deployService(service, serviceContext)

    entry.setSuccess({ msg: chalk.green(`Ready`), append: true })

    return result
  }
}
