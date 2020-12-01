/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { GcfModule, configureGcfModule } from "../google/google-cloud-functions"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { STATIC_DIR, DEFAULT_API_VERSION } from "../../constants"
import { ServiceConfig } from "../../config/service"
import { ContainerModuleConfig } from "../container/config"
import { ContainerServiceSpec, ServicePortProtocol } from "../container/config"
import { ConfigureProviderParams } from "../../types/plugin/provider/configureProvider"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { DEFAULT_BUILD_TIMEOUT } from "../container/helpers"

const pluginName = "local-google-cloud-functions"
const emulatorModuleName = "local-gcf-container"
const baseContainerName = `${pluginName}--${emulatorModuleName}`
const emulatorBaseModulePath = join(STATIC_DIR, emulatorModuleName)
const emulatorPort = 8010

export const gardenPlugin = () =>
  createGardenPlugin({
    name: pluginName,
    docs: "EXPERIMENTAL",
    handlers: {
      async configureProvider({ config }: ConfigureProviderParams) {
        const emulatorConfig: ContainerModuleConfig = {
          allowPublish: false,
          apiVersion: DEFAULT_API_VERSION,
          build: {
            dependencies: [],
          },
          description: "Base container for running Google Cloud Functions emulator",
          disabled: false,
          name: "local-gcf-container",
          path: emulatorBaseModulePath,
          serviceConfigs: [],
          spec: {
            build: {
              dependencies: [],
              timeout: DEFAULT_BUILD_TIMEOUT,
            },
            buildArgs: {},
            extraFlags: [],
            services: [],
            tasks: [],
            tests: [],
          },
          taskConfigs: [],
          testConfigs: [],
          type: "container",
        }

        return {
          config,
          moduleConfigs: [emulatorConfig],
        }
      },
    },

    extendModuleTypes: [
      {
        name: "google-cloud-function",
        handlers: {
          async configure(params: ConfigureModuleParams<GcfModule>) {
            const { moduleConfig: parsed } = await configureGcfModule(params)

            // convert the module and services to containers to run locally
            const serviceConfigs: ServiceConfig<ContainerServiceSpec>[] = parsed.serviceConfigs.map((s) => {
              const functionEntrypoint = s.spec.entrypoint || s.name

              const spec = {
                name: s.name,
                dependencies: s.dependencies,
                disabled: parsed.disabled,
                outputs: {
                  ingress: `http://${s.name}:${emulatorPort}/local/local/${functionEntrypoint}`,
                },
                annotations: {},
                args: ["/app/start.sh", functionEntrypoint],
                daemon: false,
                ingresses: [
                  {
                    name: "default",
                    annotations: {},
                    hostname: s.spec.hostname,
                    port: "http",
                    path: "/",
                  },
                ],
                env: {},
                healthCheck: { tcpPort: "http" },
                limits: s.spec.limits,
                ports: [
                  {
                    name: "http",
                    protocol: <ServicePortProtocol>"TCP",
                    containerPort: emulatorPort,
                    servicePort: emulatorPort,
                  },
                ],
                replicas: 1,
                volumes: [],
              }

              return {
                name: spec.name,
                dependencies: spec.dependencies,
                disabled: parsed.disabled,
                hotReloadable: false,
                outputs: spec.outputs,
                spec,
              }
            })

            const build = {
              dependencies: parsed.build.dependencies.concat([
                {
                  name: emulatorModuleName,
                  plugin: pluginName,
                  copy: [
                    {
                      source: "child/Dockerfile",
                      target: "Dockerfile",
                    },
                  ],
                },
              ]),
              timeout: DEFAULT_BUILD_TIMEOUT,
            }

            const moduleConfig: ContainerModuleConfig = {
              apiVersion: DEFAULT_API_VERSION,
              allowPublish: true,
              build,
              disabled: parsed.disabled,
              name: parsed.name,
              path: parsed.path,
              type: "container",

              spec: {
                build,
                buildArgs: {
                  baseImageName: `${baseContainerName}:\${modules.${baseContainerName}.version}`,
                },
                extraFlags: [],
                image: `${parsed.name}:\${modules.${parsed.name}.version}`,
                services: serviceConfigs.map((s) => <ContainerServiceSpec>s.spec),
                tasks: [],
                tests: [],
              },

              serviceConfigs,
              taskConfigs: [],
              testConfigs: parsed.testConfigs,
            }

            return { moduleConfig }
          },
        },
      },
    ],
  })
