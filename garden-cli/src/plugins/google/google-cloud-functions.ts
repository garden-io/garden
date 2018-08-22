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
} from "../../config/common"
import { Module } from "../../types/module"
import { ParseModuleResult } from "../../types/plugin/outputs"
import {
  DeployServiceParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  ParseModuleParams,
} from "../../types/plugin/params"
import { ServiceState, ServiceStatus, endpointHostnameSchema } from "../../types/service"
import {
  resolve,
} from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import { GenericTestSpec, genericTestSchema } from "../generic"
import {
  configureEnvironment,
  gcloud,
  getEnvironmentStatus,
  getProject,
  GOOGLE_CLOUD_DEFAULT_REGION,
  GoogleCloudServiceSpec,
} from "./common"
import { GardenPlugin } from "../../types/plugin/plugin"
import { ModuleSpec } from "../../config/module"
import { baseServiceSchema } from "../../config/service"

export interface GcfServiceSpec extends GoogleCloudServiceSpec {
  entrypoint?: string,
  function: string,
  hostname?: string
  path: string,
}

const gcfServiceSchema = baseServiceSchema
  .keys({
    entrypoint: Joi.string()
      .description("The entrypoint for the function (exported name in the function's module)"),
    hostname: endpointHostnameSchema,
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

const gcfModuleSpecSchema = Joi.object()
  .keys({
    functions: gcfServicesSchema,
    tests: joiArray(genericTestSchema),
  })

export interface GcfModule extends Module<GcfModuleSpec, GcfServiceSpec, GenericTestSpec> { }

export async function parseGcfModule(
  { moduleConfig }: ParseModuleParams<GcfModule>,
): Promise<ParseModuleResult<GcfModule>> {
  // TODO: check that each function exists at the specified path
  moduleConfig.spec = validate(
    moduleConfig.spec, gcfModuleSpecSchema, { context: `module ${moduleConfig.name}` },
  )

  moduleConfig.serviceConfigs = moduleConfig.spec.functions.map(f => ({
    name: f.name,
    dependencies: f.dependencies,
    outputs: f.outputs,
    spec: f,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    timeout: t.timeout,
    spec: t,
  }))

  return moduleConfig
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
        { ctx, provider, module, service, env, runtimeContext }: DeployServiceParams<GcfModule>,
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

        return getServiceStatus({ ctx, provider, module, service, env, runtimeContext })
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
