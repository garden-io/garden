/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  ModuleConfig,
} from "../../types/module"
import { ParseModuleParams } from "../../types/plugin/params"
import {
  ServiceConfig,
} from "../../types/service"
import { join } from "path"
import {
  GcfModule,
  parseGcfModule,
} from "../google/google-cloud-functions"
import {
  GardenPlugin,
} from "../../types/plugin"
import { STATIC_DIR } from "../../constants"
import {
  ContainerModuleSpec,
  ContainerServiceSpec,
  ServicePortProtocol,
} from "../container"

const pluginName = "local-google-cloud-functions"
const emulatorModuleName = "local-gcf-container"
const baseContainerName = `${pluginName}--${emulatorModuleName}`
const emulatorBaseModulePath = join(STATIC_DIR, emulatorModuleName)
const emulatorPort = 8010

export const gardenPlugin = (): GardenPlugin => ({
  modules: [emulatorBaseModulePath],

  moduleActions: {
    "google-cloud-function": {
      async parseModule(params: ParseModuleParams<GcfModule>) {
        const parsed = await parseGcfModule(params)

        // convert the module and services to containers to run locally
        const services: ServiceConfig<ContainerServiceSpec>[] = parsed.services.map((s) => {
          const functionEntrypoint = s.spec.entrypoint || s.name

          const spec = {
            name: s.name,
            dependencies: s.dependencies,
            outputs: {
              endpoint: `http://${s.name}:${emulatorPort}/local/local/${functionEntrypoint}`,
            },
            command: ["/app/start.sh", functionEntrypoint],
            daemon: false,
            endpoints: [{
              port: "http",
            }],
            healthCheck: { tcpPort: "http" },
            ports: [
              {
                name: "http",
                protocol: <ServicePortProtocol>"TCP",
                containerPort: emulatorPort,
              },
            ],
            volumes: [],
          }

          return {
            name: spec.name,
            dependencies: spec.dependencies,
            outputs: spec.outputs,
            spec,
          }
        })

        const module: ModuleConfig<ContainerModuleSpec> = {
          allowPush: true,
          build: {
            dependencies: parsed.module.build.dependencies.concat([{
              name: emulatorModuleName,
              plugin: pluginName,
              copy: [{
                source: "child/Dockerfile",
                target: "Dockerfile",
              }],
            }]),
          },
          name: parsed.module.name,
          path: parsed.module.path,
          type: "container",
          variables: parsed.module.variables,

          spec: {
            buildArgs: {
              baseImageName: `${baseContainerName}:\${dependencies.${baseContainerName}.version}`,
            },
            image: `${parsed.module.name}:\${module.version}`,
            services: services.map(s => <ContainerServiceSpec>s.spec),
            tests: [],
          },
        }

        const tests = parsed.tests

        return {
          module,
          services,
          tests,
        }
      },
    },
  },
})
