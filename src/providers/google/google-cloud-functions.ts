import { Environment, identifierRegex } from "../../types/common"
import { baseServiceSchema, Module, ModuleConfig } from "../../types/module"
import { GardenContext } from "../../context"
import { Service, ServiceState, ServiceStatus } from "../../types/service"
import { resolve } from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import { GOOGLE_CLOUD_DEFAULT_REGION, GoogleCloudProviderBase } from "./base"

export interface GoogleCloudFunctionsModuleConfig extends ModuleConfig {
  services: {
    [name: string]: {
      entrypoint?: string,
      path: string,
      project?: string,
    },
  }
}

export type GoogleCloudFunctionsService = Service<GoogleCloudFunctionsModule>

export const gcfServicesSchema = Joi.object()
  .pattern(identifierRegex, baseServiceSchema.keys({
    entrypoint: Joi.string(),
    path: Joi.string().default("."),
    project: Joi.string(),
  }))
  .default(() => ({}), "{}")

export class GoogleCloudFunctionsModule extends Module<GoogleCloudFunctionsModuleConfig> { }

export class GoogleCloudFunctionsProvider extends GoogleCloudProviderBase<GoogleCloudFunctionsModule> {
  name = "google-cloud-functions"
  supportedModuleTypes = ["google-cloud-function"]

  parseModule(ctx: GardenContext, config: GoogleCloudFunctionsModuleConfig) {
    const module = new GoogleCloudFunctionsModule(ctx, config)

    // TODO: check that each function exists at the specified path

    module.services = Joi.attempt(config.services, gcfServicesSchema)

    return module
  }

  async getServiceStatus(service: GoogleCloudFunctionsService, env: Environment): Promise<ServiceStatus> {
    const project = this.getProject(service, env)
    const functions: any[] = await this.gcloud(project).json(["beta", "functions", "list"])
    const providerId = `projects/${project}/locations/${GOOGLE_CLOUD_DEFAULT_REGION}/functions/${service.name}`

    const status = functions.filter(f => f.name === providerId)[0]

    if (!status) {
      // not deployed yet
      return {}
    }

    // TODO: map states properly
    const state: ServiceState = status.status === "ACTIVE" ? "ready" : "unhealthy"

    return {
      providerId,
      providerVersion: status.versionId,
      version: status.labels[GARDEN_ANNOTATION_KEYS_VERSION],
      state,
      updatedAt: status.updateTime,
      detail: status,
    }
  }

  async deployService(service: GoogleCloudFunctionsService, _serviceContext: {}, env: Environment) {
    // TODO: provide env vars somehow to function
    this.context.log.info(service.name, `Deploying function...`)

    const project = this.getProject(service, env)
    const functionPath = resolve(service.module.path, service.config.path)
    const entrypoint = service.config.entrypoint || service.name

    await this.gcloud(project).call([
      "beta", "functions",
      "deploy", service.name,
      `--source=${functionPath}`,
      `--entry-point=${entrypoint}`,
      // TODO: support other trigger types
      "--trigger-http",
    ])

    this.context.log.info(service.name, `Function deployed`)

    return this.getServiceStatus(service, env)
  }

  async getServiceOutputs(service: GoogleCloudFunctionsService, env: Environment) {
    // TODO: we may want to pull this from the service status instead, along with other outputs
    const project = this.getProject(service, env)

    return {
      endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
    }
  }
}
