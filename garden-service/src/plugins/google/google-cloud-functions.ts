/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  joiArray,
  validateWithPath,
} from "../../config/common"
import { Module } from "../../types/module"
import { ConfigureModuleResult } from "../../types/plugin/outputs"
import {
  DeployServiceParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  ConfigureModuleParams,
} from "../../types/plugin/params"
import { ServiceState, ServiceStatus, ingressHostnameSchema, Service } from "../../types/service"
import {
  resolve,
} from "path"
import * as Joi from "joi"
import { GARDEN_ANNOTATION_KEYS_VERSION } from "../../constants"
import { ExecTestSpec, execTestSchema } from "../exec"
import {
  prepareEnvironment,
  gcloud,
  getEnvironmentStatus,
  GOOGLE_CLOUD_DEFAULT_REGION,
  GoogleCloudServiceSpec,
} from "./common"
import { GardenPlugin } from "../../types/plugin/plugin"
import { ModuleSpec } from "../../config/module"
import { baseServiceSchema } from "../../config/service"
import { Provider } from "../../config/project"

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
    hostname: ingressHostnameSchema,
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
  tests: ExecTestSpec[],
}

export const gcfModuleSpecSchema = Joi.object()
  .keys({
    functions: gcfServicesSchema,
    tests: joiArray(execTestSchema),
  })

export interface GcfModule extends Module<GcfModuleSpec, GcfServiceSpec, ExecTestSpec> { }

function getGcfProject<T extends GcfModule>(service: Service<T>, provider: Provider) {
  return service.spec.project || provider.config["default-project"] || null
}

export async function configureGcfModule(
  { ctx, moduleConfig }: ConfigureModuleParams<GcfModule>,
): Promise<ConfigureModuleResult<GcfModule>> {

  // TODO: check that each function exists at the specified path
  moduleConfig.spec = validateWithPath({
    config: moduleConfig.spec,
    schema: gcfModuleSpecSchema,
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

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
    prepareEnvironment,
  },
  moduleActions: {
    "google-cloud-function": {
      configure: configureGcfModule,

      async deployService(params: DeployServiceParams<GcfModule>) {
        const { ctx, service } = params

        // TODO: provide env vars somehow to function
        const project = getGcfProject(service, ctx.provider)
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

        return getServiceStatus(params)
      },

      async getServiceOutputs({ ctx, service }: GetServiceOutputsParams<GcfModule>) {
        // TODO: we may want to pull this from the service status instead, along with other outputs
        const project = getGcfProject(service, ctx.provider)

        return {
          ingress: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
        }
      },
    },
  },
})

export async function getServiceStatus(
  { ctx, service }: GetServiceStatusParams<GcfModule>,
): Promise<ServiceStatus> {
  const project = getGcfProject(service, ctx.provider)
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
