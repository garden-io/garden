/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { ServiceStatus } from "../../types/service"
import { join } from "path"
import {
  gcfServicesSchema,
  GoogleCloudFunctionsModule,
  GoogleCloudFunctionsService,
} from "../google/google-cloud-functions"
import {
  DeployServiceParams,
  GetServiceLogsParams,
  GetServiceOutputsParams,
  GetServiceStatusParams,
  ParseModuleParams,
  GardenPlugin,
  BuildModuleParams,
  GetModuleBuildStatusParams,
} from "../../types/plugin"
import { STATIC_DIR } from "../../constants"
import {
  ContainerModule,
  ContainerModuleConfig,
  ContainerService,
  ServicePortProtocol,
} from "../container"
import { validate } from "../../types/common"

const baseContainerName = "local-google-cloud-functions.local-gcf-container"
const emulatorBaseModulePath = join(STATIC_DIR, "local-gcf-container")
const emulatorPort = 8010

export const gardenPlugin = (): GardenPlugin => ({
  modules: [emulatorBaseModulePath],

  moduleActions: {
    "google-cloud-function": {
      async parseModule({ ctx, moduleConfig }: ParseModuleParams<GoogleCloudFunctionsModule>) {
        moduleConfig.build.dependencies.push({
          name: baseContainerName,
          copy: [],
        })

        const module = new GoogleCloudFunctionsModule(ctx, moduleConfig)

        // TODO: check that each function exists at the specified path

        module.services = validate(
          moduleConfig.services,
          gcfServicesSchema,
          { context: `services in module ${moduleConfig.name}` },
        )

        return module
      },

      async getModuleBuildStatus({ ctx, module }: GetModuleBuildStatusParams<GoogleCloudFunctionsModule>) {
        const emulator = await getEmulatorModule(ctx, module)
        return ctx.getModuleBuildStatus(emulator)
      },

      async buildModule({ ctx, module, logEntry }: BuildModuleParams<GoogleCloudFunctionsModule>) {
        const baseModule = <ContainerModule>await ctx.getModule(baseContainerName)
        const emulator = await getEmulatorModule(ctx, module)
        const baseImageName = (await baseModule.getLocalImageId())!
        return ctx.buildModule(emulator, { baseImageName }, logEntry)
      },

      async getServiceStatus(
        { ctx, service }: GetServiceStatusParams<GoogleCloudFunctionsModule>,
      ): Promise<ServiceStatus> {
        const emulator = await getEmulatorService(ctx, service)
        return ctx.getServiceStatus(emulator)
      },

      async deployService({ ctx, service }: DeployServiceParams<GoogleCloudFunctionsModule>) {
        const emulatorService = await getEmulatorService(ctx, service)
        return ctx.deployService(emulatorService)
      },

      async getServiceOutputs({ service }: GetServiceOutputsParams<GoogleCloudFunctionsModule>) {
        return {
          endpoint: `http://${service.name}:${emulatorPort}/local/local/${service.config.entrypoint || service.name}`,
        }
      },

      async getServiceLogs({ ctx, service, stream, tail }: GetServiceLogsParams<GoogleCloudFunctionsModule>) {
        const emulator = await getEmulatorService(ctx, service)
        return ctx.getServiceLogs(emulator, stream, tail)
      },
    },
  },
})

async function getEmulatorModule(ctx: PluginContext, module: GoogleCloudFunctionsModule) {
  const services = module.services.map((s) => {
    const functionEntrypoint = s.entrypoint || s.name

    return {
      name: s.name,
      command: ["/app/start.sh", functionEntrypoint],
      daemon: false,
      dependencies: s.dependencies,
      endpoints: [{
        port: "http",
      }],
      healthCheck: { tcpPort: "http" },
      ports: [
        {
          name: "http",
          protocol: <ServicePortProtocol>"TCP",
          containerPort: 8010,
        },
      ],
      volumes: [],
    }
  })

  const config = module.config
  const version = await module.getVersion()

  return new ContainerModule(ctx, <ContainerModuleConfig>{
    allowPush: true,
    build: {
      dependencies: config.build.dependencies.concat([{
        name: baseContainerName,
        copy: [{
          source: "child/Dockerfile",
          target: "Dockerfile",
        }],
      }]),
    },
    image: `${module.name}:${version.versionString}`,
    name: module.name,
    path: module.path,
    services,
    test: config.test,
    type: "container",
    variables: config.variables,
  })
}

async function getEmulatorService(ctx: PluginContext, service: GoogleCloudFunctionsService) {
  const emulatorModule = await getEmulatorModule(ctx, service.module)
  return ContainerService.factory(ctx, emulatorModule, service.name)
}
