import * as Joi from "joi"
import { Task } from "../task-graph"
import { GardenContext } from "../context"
import { BuildTask } from "./build"
import { values } from "lodash"
import { Service } from "../types/service"
import { joiPrimitive } from "../types/common"
import { EntryStyle } from "../logger/types"
import chalk from "chalk"

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

    // TODO: get version from build task results
    const version = await this.service.module.getVersion()
    const status = await this.ctx.getServiceStatus(this.service)

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

    const serviceContext = { envVars: await this.prepareEnvVars(version) }
    const result = await this.ctx.deployService(this.service, serviceContext)

    entry.setSuccess({ msg: chalk.green(`Ready`), append: true })

    return result
  }

  private async prepareEnvVars(version: string) {
    const envVars = {
      GARDEN_VERSION: version,
    }
    const dependencies = await this.service.getDependencies(this.ctx)

    for (const key in this.ctx.projectConfig.variables) {
      envVars[key] = this.ctx.projectConfig.variables[key]
    }

    for (const dep of dependencies) {
      const outputs = await this.ctx.getServiceOutputs(dep)
      const serviceEnvName = dep.getEnvVarName()

      for (const key of Object.keys(outputs)) {
        const envKey = Joi.attempt(key, Joi.string())
        const envVarName = `GARDEN_SERVICES_${serviceEnvName}_${envKey}`.toUpperCase()
        envVars[envVarName] = Joi.attempt(outputs[key], joiPrimitive())
      }
    }

    return envVars
  }
}
