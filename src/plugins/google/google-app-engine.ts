/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus } from "../../types/service"
import { join } from "path"
import {
  gcloud,
  getProject,
} from "./common"
import {
  getEnvironmentStatus,
  GOOGLE_CLOUD_DEFAULT_REGION,
  configureEnvironment,
} from "./common"
import { ContainerModule, ContainerModuleConfig, ContainerServiceConfig } from "../container"
import { dumpYaml } from "../../util"
import {
  DeployServiceParams,
  GardenPlugin,
  GetServiceOutputsParams,
} from "../../types/plugin"

export interface GoogleAppEngineServiceConfig extends ContainerServiceConfig {
  project: string
}

export interface GoogleAppEngineModuleConfig extends ContainerModuleConfig<GoogleAppEngineServiceConfig> { }

export class GoogleAppEngineModule extends ContainerModule<GoogleAppEngineModuleConfig> { }

export const gardenPlugin = (): GardenPlugin => ({
  actions: {
    getEnvironmentStatus,
    configureEnvironment,
  },
  moduleActions: {
    container: {
      async getServiceStatus(): Promise<ServiceStatus> {
        // TODO
        // const project = this.getProject(service, env)
        //
        // const appStatus = await this.gcloud(project).json(["app", "describe"])
        // const services = await this.gcloud(project).json(["app", "services", "list"])
        // const instances: any[] = await this.gcloud(project).json(["app", "instances", "list"])

        return {}
      },

      async deployService({ ctx, service, serviceContext, env }: DeployServiceParams<GoogleAppEngineModule>) {
        ctx.log.info({
          section: service.name,
          msg: `Deploying app...`,
        })

        const config = service.config

        // prepare app.yaml
        const appYaml: any = {
          runtime: "custom",
          env: "flex",
          env_variables: serviceContext.envVars,
        }

        if (config.healthCheck) {
          if (config.healthCheck.tcpPort || config.healthCheck.command) {
            ctx.log.warn({
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
        dumpYaml(appYamlPath, appYaml)

        // deploy to GAE
        const project = getProject("google-app-engine", service, env)

        await gcloud(project).call([
          "app", "deploy", "--quiet",
        ], { cwd: service.module.path })

        ctx.log.info({ section: service.name, msg: `App deployed` })
      },

      async getServiceOutputs({ service, env }: GetServiceOutputsParams<GoogleAppEngineModule>) {
        // TODO: we may want to pull this from the service status instead, along with other outputs
        const project = getProject("google-app-engine", service, env)

        return {
          endpoint: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
        }
      },
    },
  },
})
