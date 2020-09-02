/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiArray, joi } from "../../config/common"
import { GardenModule } from "../../types/module"
import { ServiceState, ServiceStatus, ingressHostnameSchema, Service } from "../../types/service"
import { resolve } from "path"
import { ExecTestSpec, execTestSchema } from "../exec"
import { prepareEnvironment, gcloud, getEnvironmentStatus, GOOGLE_CLOUD_DEFAULT_REGION } from "./common"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { baseServiceSpecSchema, CommonServiceSpec } from "../../config/service"
import { Provider, providerConfigBaseSchema } from "../../config/provider"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../types/plugin/module/configure"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../types/plugin/service/getServiceStatus"
import { ServiceLimitSpec } from "../container/config"
import { gardenAnnotationKey } from "../../util/string"

const gcfModuleSpecSchema = () =>
  baseServiceSpecSchema()
    .keys({
      entrypoint: joi.string().description("The entrypoint for the function (exported name in the function's module)"),
      hostname: ingressHostnameSchema(),
      path: joi.string().default(".").description("The path of the module that contains the function."),
      project: joi.string().description("The Google Cloud project name of the function."),
      tests: joiArray(execTestSchema()),
    })
    .description("Configuration for a Google Cloud Function.")

export interface GcfModuleSpec extends CommonServiceSpec {
  entrypoint?: string
  function: string
  hostname?: string
  limits: ServiceLimitSpec
  path: string
  project?: string
  tests: ExecTestSpec[]
}

export type GcfServiceSpec = GcfModuleSpec

export interface GcfModule extends GardenModule<GcfModuleSpec, GcfServiceSpec, ExecTestSpec> {}

function getGcfProject<T extends GcfModule>(service: Service<T>, provider: Provider<any>) {
  return service.spec.project || provider.config.defaultProject || null
}

export async function configureGcfModule({
  moduleConfig,
}: ConfigureModuleParams<GcfModule>): Promise<ConfigureModuleResult<GcfModule>> {
  // TODO: we may want to pull this from the service status instead, along with other outputs
  const { name, spec } = moduleConfig

  moduleConfig.serviceConfigs = [
    {
      name,
      dependencies: spec.dependencies,
      disabled: spec.disabled,
      hotReloadable: false,
      spec,
    },
  ]

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    timeout: t.timeout,
    spec: t,
  }))

  return { moduleConfig }
}

const configSchema = providerConfigBaseSchema().keys({
  project: joi
    .string()
    .description("The default GCP project to deploy functions to (can be overridden on individual functions)."),
})

export const gardenPlugin = createGardenPlugin({
  name: "google-cloud-function",
  docs: "EXPERIMENTAL",
  configSchema,
  handlers: {
    getEnvironmentStatus,
    prepareEnvironment,
  },
  createModuleTypes: [
    {
      name: "google-cloud-function",
      docs: "(TODO)",
      schema: gcfModuleSpecSchema(),
      handlers: {
        configure: configureGcfModule,

        async getModuleOutputs({ ctx, moduleConfig }) {
          const project = moduleConfig.spec.project || ctx.provider.config.defaultProject

          return {
            outputs: {
              endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${name}`,
            },
          }
        },

        async deployService(params: DeployServiceParams<GcfModule>) {
          const { ctx, service } = params

          // TODO: provide env vars somehow to function
          const project = getGcfProject(service, ctx.provider)
          const functionPath = resolve(service.module.path, service.spec.path)
          const entrypoint = service.spec.entrypoint || service.name

          await gcloud(project).call([
            "beta",
            "functions",
            "deploy",
            service.name,
            `--source=${functionPath}`,
            `--entry-point=${entrypoint}`,
            // TODO: support other trigger types
            "--trigger-http",
          ])

          return getServiceStatus(params)
        },
      },
    },
  ],
})

export async function getServiceStatus({ ctx, service }: GetServiceStatusParams<GcfModule>): Promise<ServiceStatus> {
  const project = getGcfProject(service, ctx.provider)
  const functions: any[] = await gcloud(project).json(["beta", "functions", "list"])
  const providerId = `projects/${project}/locations/${GOOGLE_CLOUD_DEFAULT_REGION}/functions/${service.name}`

  const status = functions.filter((f) => f.name === providerId)[0]

  if (!status) {
    // not deployed yet
    return { state: "missing", detail: {} }
  }

  // TODO: map states properly
  const state: ServiceState = status.status === "ACTIVE" ? "ready" : "unhealthy"

  return {
    externalId: providerId,
    externalVersion: status.versionId,
    version: status.labels[gardenAnnotationKey("version")],
    state,
    updatedAt: status.updateTime,
    detail: status,
  }
}
