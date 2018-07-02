/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  joiArray,
  validate,
} from "../../types/common"
import {
  Module,
  ModuleSpec,
} from "../../types/module"
import { ParseModuleResult } from "../../types/plugin/outputs"
import {
  DeployServiceParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import {
  baseServiceSchema,
  ServiceState,
  ServiceStatus,
} from "../../types/service"
import {
  resolve,
} from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import { GenericTestSpec } from "../generic"
import {
  configureEnvironment,
  gcloud,
  getEnvironmentStatus,
  getProject,
  GOOGLE_CLOUD_DEFAULT_REGION,
  GoogleCloudServiceSpec,
} from "./common"
import {
  GardenPlugin,
} from "../../types/plugin/plugin"

export interface GcfServiceSpec extends GoogleCloudServiceSpec {
  function: string,
  entrypoint?: string,
  path: string,
}

const gcfServiceSchema = baseServiceSchema
  .keys({
    entrypoint: Joi.string()
      .description("The entrypoint for the function (exported name in the function's module)"),
    path: Joi.string()
      .default(".")
      .description("The path of the module that contains the function."),
    project: Joi.string()
      .description("The Google Cloud project name of the function."),
  })
  .description("Configuration for a Google Cloud Function.")

export const gcfServicesSchema = joiArray(gcfServiceSchema)
  .min(1)
  .unique("name")
  .description("List of configurations for one or more Google Cloud Functions.")

export interface GcfModuleSpec extends ModuleSpec {
  functions: GcfServiceSpec[],
  tests: GenericTestSpec[],
}

export class GcfModule extends Module<GcfModuleSpec, GcfServiceSpec, GenericTestSpec> { }

export async function parseGcfModule(
  { moduleConfig }: ParseModuleParams<GcfModule>,
): Promise<ParseModuleResult<GcfModule>> {
  // TODO: check that each function exists at the specified path
  const functions = validate(
    moduleConfig.spec.functions, gcfServicesSchema, { context: `services in module ${moduleConfig.name}` },
  )

  return {
    module: moduleConfig,
    services: functions.map(f => ({
      name: f.name,
      dependencies: f.dependencies,
      outputs: f.outputs,
      spec: f,
    })),
    tests: moduleConfig.spec.tests.map(t => ({
      name: t.name,
      dependencies: t.dependencies,
      timeout: t.timeout,
      spec: t,
    })),
  }
}

export const gardenPlugin = (): GardenPlugin => ({
  actions: {
    getEnvironmentStatus,
    configureEnvironment,
  },
  moduleActions: {
    "google-cloud-function": {
      parseModule: parseGcfModule,

      async deployService(
        { ctx, provider, module, service, env }: DeployServiceParams<GcfModule>,
      ) {
        // TODO: provide env vars somehow to function
        const project = getProject(service, provider)
        const functionPath = resolve(service.module.path, service.spec.path)
        const entrypoint = service.spec.entrypoint || service.name

        await gcloud(project).call([
          "beta", "functions",
          "deploy", service.name,
          `--source=${functionPath}`,
          `--entry-point=${entrypoint}`,
          // TODO: support other trigger types
          "--trigger-http",
        ])

        return getServiceStatus({ ctx, provider, module, service, env })
      },

      async getServiceOutputs({ service, provider }: GetServiceOutputsParams<GcfModule>) {
        // TODO: we may want to pull this from the service status instead, along with other outputs
        const project = getProject(service, provider)

        return {
          endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
        }
      },
    },
  },
})

export async function getServiceStatus(
  { service, provider }: GetServiceStatusParams<GcfModule>,
): Promise<ServiceStatus> {
  const project = getProject(service, provider)
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
