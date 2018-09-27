/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  DeployServiceParams,
  GetServiceOutputsParams,
} from "../../types/plugin/params"
import { ServiceStatus } from "../../types/service"
import { join } from "path"
import {
  gcloud,
  getProject,
} from "./common"
import {
  getEnvironmentStatus,
  GOOGLE_CLOUD_DEFAULT_REGION,
  prepareEnvironment,
} from "./common"
import {
  ContainerModule,
  ContainerModuleSpec,
  ContainerServiceSpec,
} from "../container"
import { dumpYaml } from "../../util/util"
import {
  GardenPlugin,
} from "../../types/plugin/plugin"

export interface GoogleAppEngineServiceSpec extends ContainerServiceSpec {
  project?: string
}

export interface GoogleAppEngineModule extends ContainerModule<ContainerModuleSpec, GoogleAppEngineServiceSpec> { }

export const gardenPlugin = (): GardenPlugin => ({
  actions: {
    getEnvironmentStatus,
    prepareEnvironment,
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

      async deployService({ ctx, service, runtimeContext, logEntry }: DeployServiceParams<GoogleAppEngineModule>) {
        logEntry && logEntry.info({
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
            logEntry && logEntry.warn({
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
        const project = getProject(service, ctx.provider)

        await gcloud(project).call([
          "app", "deploy", "--quiet",
        ], { cwd: service.module.path })

        logEntry && logEntry.info({ section: service.name, msg: `App deployed` })

        return {}
      },

      async getServiceOutputs({ ctx, service }: GetServiceOutputsParams<GoogleAppEngineModule>) {
        // TODO: we may want to pull this from the service status instead, along with other outputs
        const project = getProject(service, ctx.provider)

        return {
          ingress: `https://${GOOGLE_CLOUD_DEFAULT_REGION}-${project}.cloudfunctions.net/${service.name}`,
        }
      },
    },
  },
})
