/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { identifierRegex, validate } from "../../types/common"
import { baseServiceSchema, Module, ModuleConfig } from "../../types/module"
import { ServiceConfig, ServiceState, ServiceStatus } from "../../types/service"
import {
  resolve,
} from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import {
  configureEnvironment,
  gcloud,
  getEnvironmentStatus,
  getProject,
  GOOGLE_CLOUD_DEFAULT_REGION,
} from "./common"
import {
  DeployServiceParams,
  GardenPlugin,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin"

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

const pluginName = "google-cloud-functions"

export const gardenPlugin = (): GardenPlugin => ({
  actions: {
    getEnvironmentStatus,
    configureEnvironment,
  },
  moduleActions: {
    "google-cloud-function": {
      async parseModule({ ctx, moduleConfig }: ParseModuleParams<GoogleCloudFunctionsModule>) {
        const module = new GoogleCloudFunctionsModule(ctx, moduleConfig)

        // TODO: check that each function exists at the specified path

        module.services = validate(
          moduleConfig.services, gcfServicesSchema, `services in module ${moduleConfig.name}`,
        )

        return module
      },

      async deployService(
        { ctx, provider, service, env }: DeployServiceParams<GoogleCloudFunctionsModule>,
      ) {
        // TODO: provide env vars somehow to function
        const project = getProject(pluginName, service, env)
        const functionPath = resolve(service.module.path, service.config.path)
        const entrypoint = service.config.entrypoint || service.name

        await gcloud(project).call([
          "beta", "functions",
          "deploy", service.name,
          `--source=${functionPath}`,
          `--entry-point=${entrypoint}`,
          // TODO: support other trigger types
          "--trigger-http",
        ])

        return getServiceStatus({ ctx, provider, service, env })
      },

      async getServiceOutputs({ service, env }: GetServiceOutputsParams<GoogleCloudFunctionsModule>) {
        // TODO: we may want to pull this from the service status instead, along with other outputs
        const project = getProject(pluginName, service, env)

        return {
          endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
        }
      },
    },
  },
})

export async function getServiceStatus(
  { service, env }: GetServiceStatusParams<GoogleCloudFunctionsModule>,
): Promise<ServiceStatus> {
  const project = getProject(pluginName, service, env)
  const functions: any[] = await gcloud(project).json(["beta", "functions", "list"])
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
