import { GardenContext } from "../../context"
import { Service, ServiceStatus } from "../../types/service"
import { join, relative, resolve } from "path"
import * as Joi from "joi"
import * as escapeStringRegexp from "escape-string-regexp"
import { DeploymentError } from "../../exceptions"
import {
  gcfServicesSchema, GoogleCloudFunctionsModule,
  GoogleCloudFunctionsModuleConfig, GoogleCloudFunctionsService,
} from "../google/google-cloud-functions"
import { Plugin } from "../../types/plugin"

const emulatorModulePath = join(__dirname, "local-gcf-container")
const emulatorPort = 8010
const emulatorServiceName = "google-cloud-functions"

export class LocalGoogleCloudFunctionsProvider extends Plugin<GoogleCloudFunctionsModule> {
  name = "local-google-cloud-functions"
  supportedModuleTypes = ["google-cloud-function"]

  parseModule(ctx: GardenContext, config: GoogleCloudFunctionsModuleConfig) {
    const module = new GoogleCloudFunctionsModule(ctx, config)

    // TODO: check that each function exists at the specified path

    module.services = Joi.attempt(config.services, gcfServicesSchema)

    return module
  }

  async getEnvironmentStatus() {
    // Check if functions emulator container is running
    const status = await this.context.getServiceStatus(await this.getEmulatorService())

    return { configured: status.state === "ready" }
  }

  async configureEnvironment() {
    const status = await this.getEnvironmentStatus()

    // TODO: This check should happen ahead of calling this handler
    if (status.configured) {
      return
    }

    const service = await this.getEmulatorService()

    // We mount the project root into the container, so we can exec deploy any function in there later.
    service.config.volumes = [{
      name: "functions",
      containerPath: "/functions",
      hostPath: this.context.projectRoot,
    }]

    // TODO: Publish this container separately from the project instead of building it here
    await this.context.buildModule(service.module)
    await this.context.deployService(service)
  }

  async getServiceStatus(service: GoogleCloudFunctionsService): Promise<ServiceStatus> {
    const emulator = await this.getEmulatorService()
    const result = await this.context.execInService(emulator, ["functions-emulator", "list"])

    // Regex fun. Yay.
    // TODO: Submit issue/PR to @google-cloud/functions-emulator to get machine-readable output
    if (result.output.match(new RegExp(`READY\\s+│\\s+${escapeStringRegexp(service.name)}\\s+│`, "g"))) {
      // For now we don't have a way to track which version is developed.
      // We most likely need to keep track of that on our side.
      return { state: "ready" }
    } else {
      return {}
    }
  }

  async deployService(service: GoogleCloudFunctionsService) {
    this.context.log.info({
      section: service.name,
      msg: `Deploying function...`,
    })

    const containerFunctionPath = resolve(
      "/functions",
      relative(this.context.projectRoot, service.module.path),
      service.config.path,
    )

    const emulator = await this.getEmulatorService()
    const result = await this.context.execInService(
      emulator,
      [
        "functions-emulator", "deploy",
        "--trigger-http",
        "--project", "local",
        "--region", "local",
        "--local-path", containerFunctionPath,
        "--entry-point", service.config.entrypoint || service.name,
        service.config.function,
      ],
    )

    if (result.code !== 0) {
      throw new DeploymentError(`Deploying function ${service.name} failed: ${result.output}`, {
        serviceName: service.name,
        error: result.stderr,
      })
    }

    this.context.log.info({
      section: service.name,
      msg: `Function deployed`,
    })

    return this.getServiceStatus(service)
  }

  async getServiceOutputs(service: GoogleCloudFunctionsService) {
    const emulator = await this.getEmulatorService()

    return {
      endpoint: `http://${emulator.name}:${emulatorPort}/local/local/${service.config.function}`,
    }
  }

  private async getEmulatorService() {
    const module = await this.context.resolveModule(emulatorModulePath)

    return new Service(module, emulatorServiceName)
  }
}
