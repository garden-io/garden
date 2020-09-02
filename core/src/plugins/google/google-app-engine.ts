/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState } from "../../types/service"
import { join } from "path"
import { gcloud } from "./common"
import { getEnvironmentStatus, GOOGLE_CLOUD_DEFAULT_REGION, prepareEnvironment } from "./common"
import { dumpYaml } from "../../util/util"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { ContainerModule } from "../container/config"
import { providerConfigBaseSchema } from "../../config/provider"
import { DeployServiceParams } from "../../types/plugin/service/deployService"
import { joi } from "../../config/common"

const configSchema = providerConfigBaseSchema().keys({
  project: joi.string().required().description("The GCP project to deploy containers to."),
})

export const gardenPlugin = createGardenPlugin({
  name: "google-app-engine",
  docs: "EXPERIMENTAL",
  configSchema,
  handlers: {
    getEnvironmentStatus,
    prepareEnvironment,
  },
  extendModuleTypes: [
    {
      name: "container",
      handlers: {
        async getModuleOutputs({ ctx, moduleConfig }) {
          // TODO: we may want to pull this from the service status instead, along with other outputs
          const project = ctx.provider.config.project
          const endpoint = `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${moduleConfig.name}`

          return {
            outputs: {
              endpoint,
            },
          }
        },

        async getServiceStatus(): Promise<ServiceStatus> {
          // TODO
          // const project = this.getProject(service, env)
          //
          // const appStatus = await this.gcloud(project).json(["app", "describe"])
          // const services = await this.gcloud(project).json(["app", "services", "list"])
          // const instances: any[] = await this.gcloud(project).json(["app", "instances", "list"])

          return { state: <ServiceState>"unknown", detail: {} }
        },

        async deployService({ ctx, service, runtimeContext, log }: DeployServiceParams<ContainerModule>) {
          log.info({
            section: service.name,
            msg: `Deploying app...`,
          })

          const config = service.spec

          // prepare app.yaml
          const appYaml: any = {
            runtime: "custom",
            env: "flex",
            env_variables: { ...runtimeContext.envVars, ...service.spec.env },
          }

          if (config.healthCheck) {
            if (config.healthCheck.tcpPort || config.healthCheck.command) {
              log.warn({
                section: service.name,
                msg: "GAE only supports httpGet health checks",
              })
            }
            if (config.healthCheck.httpGet) {
              appYaml.liveness_check = { path: config.healthCheck.httpGet.path }
              appYaml.readiness_check = { path: config.healthCheck.httpGet.path }
            }
          }

          // write app.yaml to build context
          const appYamlPath = join(service.module.path, "app.yaml")
          await dumpYaml(appYamlPath, appYaml)

          // deploy to GAE
          const project = ctx.provider.config.project

          await gcloud(project).call(["app", "deploy", "--quiet"], { cwd: service.module.path })

          log.info({ section: service.name, msg: `App deployed` })

          return { state: <ServiceState>"ready", detail: {} }
        },
      },
    },
  ],
})
