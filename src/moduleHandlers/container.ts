import * as Joi from "joi"
import * as childProcess from "child-process-promise"
import { ModuleHandler } from "./base"
import { baseModuleSchema, ModuleConfig } from "../types/module-config"
import { identifierRegex } from "../types/common"
import { existsSync } from "fs"
import { join } from "path"
import { ConfigurationError } from "../exceptions"
import { round } from "lodash"

interface ServicePortSpec {
  container: number
  name?: string
}

interface ContainerModuleConfig extends ModuleConfig {
  image?: string
  services?: {
    command?: string,
    ports?: ServicePortSpec[],
  }
}

const containerSchema = baseModuleSchema.keys({
  image: Joi.string(),
  services: Joi.object()
    .pattern(identifierRegex, Joi.object()
      .keys({
        command: Joi.array().items(Joi.string()),
        ports: Joi.array()
          .items(
            Joi.object()
              .keys({
                container: Joi.number().required(),
                name: Joi.string(),
              })
              .required(),
          )
          .default(() => [], "[]"),
      }))
    .default(() => [], "[]"),
})

// TODO: support remote registries and pushing
export class ContainerModule extends ModuleHandler<ContainerModuleConfig> {
  type = "container"

  validate(config: ContainerModuleConfig) {
    this.config = <ContainerModuleConfig>containerSchema.validate(config.services).value

    // make sure we can build the thing
    if (!config.image && !existsSync(join(this.path, "Dockerfile"))) {
      throw new ConfigurationError(
        `Module ${config.name} neither specified base image nor provides Dockerfile`,
        {},
        )
    }
  }

  async build({ force = false } = {}) {
    if (!!this.config.image) {
      await this.pullImage()
      return { fetched: true }
    }

    const identifier = await this.getIdentifier()
    const name = this.name

    let build = async (doForce = false) => {
      if (doForce || !await this.isBuilt()) {
        const startTime = new Date().getTime()

        this.context.log.info(name, `building ${identifier}...`)

        // TODO: log error if it occurs
        await this.dockerCli(`build -t ${identifier} ${this.path}`)

        const buildTime = (new Date().getTime()) - startTime
        this.context.log.info(name, `built ${identifier} (took ${round(buildTime / 1000, 1)} sec)`)

        return { fresh: true }
      } else {
        return {}
      }
    }

    if (force || !await this.imageExistsLocally(identifier)) {
      // build doesn't exist, so we create it
      return build(force)
    } else {
      return {}
    }
  }

  async isBuilt() {
    if (this.config.image) {
      return true
    }

    const identifier = await this.getIdentifier()

    return await this.imageExistsLocally(identifier)
  }

  async imageExistsLocally(identifier: string) {
    return (await this.dockerCli(`images ${identifier} -q`)).stdout.trim().length > 0
  }

  async getIdentifier() {
    return this.config.image || this.name
  }

  private async pullImage() {
    const identifier = await this.getIdentifier()

    if (!await this.imageExistsLocally(identifier)) {
      this.context.log.info(this.name, `pulling image ${identifier}...`)
      await this.dockerCli(`pull ${identifier}`)
    }
  }

  async dockerCli(args) {
    return childProcess.exec("docker " + args, { cwd: this.path, maxBuffer: 1024 * 1024 })
  }
}
