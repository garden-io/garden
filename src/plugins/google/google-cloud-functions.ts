/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { identifierRegex, validate } from "../../types/common"
import { baseServiceSchema, Module, ModuleConfig } from "../../types/module"
import { Garden } from "../../garden"
import { ServiceConfig, ServiceState, ServiceStatus } from "../../types/service"
import { resolve } from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import { GOOGLE_CLOUD_DEFAULT_REGION, GoogleCloudProviderBase } from "./base"
import { PluginActionParams } from "../../types/plugin"

export interface GoogleCloudFunctionsServiceConfig extends ServiceConfig {
  function: string,
  entrypoint?: string,
  path: string,
  project?: string,
}

export interface GoogleCloudFunctionsModuleConfig extends ModuleConfig<GoogleCloudFunctionsServiceConfig> { }

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

  async parseModule({ ctx, config }: { ctx: Garden, config: GoogleCloudFunctionsModuleConfig }) {
    const module = new GoogleCloudFunctionsModule(ctx, config)

    // TODO: check that each function exists at the specified path

    module.services = validate(config.services, gcfServicesSchema, `services in module ${config.name}`)

    return module
  }

  async getServiceStatus(
    { service, env }: PluginActionParams<GoogleCloudFunctionsModule>["getServiceStatus"],
  ): Promise<ServiceStatus> {
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

  async deployService(
    { ctx, service, env }: PluginActionParams<GoogleCloudFunctionsModule>["deployService"],
  ) {
    // TODO: provide env vars somehow to function
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

    return this.getServiceStatus({ ctx, service, env })
  }

  async getServiceOutputs({ service, env }: PluginActionParams<GoogleCloudFunctionsModule>["getServiceOutputs"]) {
    // TODO: we may want to pull this from the service status instead, along with other outputs
    const project = this.getProject(service, env)

    return {
      endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
    }
  }
}
