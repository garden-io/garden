/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { keyBy } from "lodash"

import { ConfigurationError } from "../../exceptions"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { containerHelpers } from "./helpers"
import { ContainerModule, containerModuleSpecSchema } from "./config"
import { buildContainerModule, getContainerBuildStatus } from "./build"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { HotReloadServiceParams } from "../../types/plugin/service/hotReloadService"
import { joi } from "../../config/common"
import { publishContainerModule } from "./publish"
import { SuggestModulesParams, SuggestModulesResult } from "../../types/plugin/module/suggestModules"
import { listDirectory } from "../../util/fs"
import { dedent } from "../../util/string"
import { getModuleTypeUrl } from "../../docs/common"
import { Provider, GenericProviderConfig, providerConfigBaseSchema } from "../../config/provider"
import { isSubdir } from "../../util/util"

export interface ContainerProviderConfig extends GenericProviderConfig {}
export type ContainerProvider = Provider<ContainerProviderConfig>

export const containerModuleOutputsSchema = () =>
  joi.object().keys({
    "local-image-name": joi
      .string()
      .required()
      .description("The name of the image (without tag/version) that the module uses for local builds and deployments.")
      .example("my-module"),
    "local-image-id": joi
      .string()
      .required()
      .description(
        "The full ID of the image (incl. tag/version) that the module uses for local builds and deployments."
      )
      .example("my-module:v-abf3f8dca"),
    "deployment-image-name": joi
      .string()
      .required()
      .description("The name of the image (without tag/version) that the module will use during deployment.")
      .example("my-deployment-registry.io/my-org/my-module"),
    "deployment-image-id": joi
      .string()
      .required()
      .description("The full ID of the image (incl. tag/version) that the module will use during deployment.")
      .example("my-deployment-registry.io/my-org/my-module:v-abf3f8dca"),
  })

const taskOutputsSchema = joi.object().keys({
  log: joi
    .string()
    .allow("")
    .default("")
    .description(
      "The full log from the executed task. " +
        "(Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!)"
    ),
})

export async function configureContainerModule({ log, moduleConfig }: ConfigureModuleParams<ContainerModule>) {
  // validate hot reload configuration
  // TODO: validate this when validating this action's output
  const hotReloadConfig = moduleConfig.spec.hotReload

  if (hotReloadConfig) {
    const invalidPairDescriptions: string[] = []
    const targets = hotReloadConfig.sync.map((syncSpec) => syncSpec.target)

    // Verify that sync targets are mutually disjoint - i.e. that no target is a subdirectory of
    // another target. Mounting directories into mounted directories will cause unexpected results
    for (const t of targets) {
      for (const t2 of targets) {
        if (isSubdir(t2, t) && t !== t2) {
          invalidPairDescriptions.push(`${t} is a subdirectory of ${t2}.`)
        }
      }
    }

    if (invalidPairDescriptions.length > 0) {
      // TODO: Adapt this message to also handle source errors
      throw new ConfigurationError(
        dedent`Invalid hot reload configuration - a target may not be a subdirectory of another target
        in the same module.

        ${invalidPairDescriptions.join("\n")}`,
        { invalidPairDescriptions, hotReloadConfig }
      )
    }
  }

  const hotReloadable = !!moduleConfig.spec.hotReload

  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((spec) => {
    // make sure ports are correctly configured
    const name = spec.name
    const definedPorts = spec.ports
    const portsByName = keyBy(spec.ports, "name")

    for (const ingress of spec.ingresses) {
      const ingressPort = ingress.port

      if (!portsByName[ingressPort]) {
        throw new ConfigurationError(`Service ${name} does not define port ${ingressPort} defined in ingress`, {
          definedPorts,
          ingressPort,
        })
      }
    }

    if (spec.healthCheck && spec.healthCheck.httpGet) {
      const healthCheckHttpPort = spec.healthCheck.httpGet.port

      if (!portsByName[healthCheckHttpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
          { definedPorts, healthCheckHttpPort }
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.tcpPort) {
      const healthCheckTcpPort = spec.healthCheck.tcpPort

      if (!portsByName[healthCheckTcpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
          { definedPorts, healthCheckTcpPort }
        )
      }
    }

    for (const volume of spec.volumes) {
      if (volume.module) {
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
        spec.dependencies.push(volume.module)
      }
    }

    return {
      name,
      dependencies: spec.dependencies,
      disabled: spec.disabled,
      hotReloadable,
      spec,
    }
  })

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => {
    for (const volume of t.volumes) {
      if (volume.module) {
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
        t.dependencies.push(volume.module)
      }
    }

    return {
      name: t.name,
      dependencies: t.dependencies,
      disabled: t.disabled,
      spec: t,
      timeout: t.timeout,
    }
  })

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => {
    for (const volume of t.volumes) {
      if (volume.module) {
        moduleConfig.build.dependencies.push({ name: volume.module, copy: [] })
        t.dependencies.push(volume.module)
      }
    }

    return {
      name: t.name,
      cacheResult: t.cacheResult,
      dependencies: t.dependencies,
      disabled: t.disabled,
      spec: t,
      timeout: t.timeout,
    }
  })

  // All the config keys that affect the build version
  moduleConfig.buildConfig = {
    buildArgs: moduleConfig.spec.buildArgs,
    targetImage: moduleConfig.spec.build?.targetImage,
    extraFlags: moduleConfig.spec.extraFlags,
    dockerfile: moduleConfig.spec.dockerfile,
  }

  // Automatically set the include field based on the Dockerfile and config, if not explicitly set
  if (!(moduleConfig.include || moduleConfig.exclude)) {
    moduleConfig.include = await containerHelpers.autoResolveIncludes(moduleConfig, log)
  }

  return { moduleConfig }
}

async function suggestModules({ name, path }: SuggestModulesParams): Promise<SuggestModulesResult> {
  const dockerfiles = (await listDirectory(path, { recursive: false })).filter(
    (filename) => filename.startsWith("Dockerfile") || filename.endsWith("Dockerfile")
  )

  return {
    suggestions: dockerfiles.map((dockerfileName) => {
      return {
        description: `based on found ${chalk.white(dockerfileName)}`,
        module: {
          kind: "Module",
          type: "container",
          name,
          dockerfile: dockerfileName,
        },
      }
    }),
  }
}

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "container",
    docs: dedent`
    Provides the [container](${getModuleTypeUrl("container")}) module type.
    _Note that this provider is currently automatically included, and you do not need to configure it in your project configuration._
  `,
    createModuleTypes: [
      {
        name: "container",
        docs: dedent`
        Specify a container image to build or pull from a remote registry.
        You may also optionally specify services to deploy, tasks or tests to run inside the container.

        Note that the runtime services have somewhat limited features in this module type. For example, you cannot
        specify replicas for redundancy, and various platform-specific options are not included. For those, look at
        other module types like [helm](${getModuleTypeUrl("helm")}) or
        [kubernetes](${getModuleTypeUrl("kubernetes")}).
      `,
        moduleOutputsSchema: containerModuleOutputsSchema(),
        schema: containerModuleSpecSchema(),
        taskOutputsSchema,
        handlers: {
          configure: configureContainerModule,
          suggestModules,
          getBuildStatus: getContainerBuildStatus,
          build: buildContainerModule,
          publish: publishContainerModule,

          async getModuleOutputs({ moduleConfig, version }) {
            const deploymentImageName = containerHelpers.getDeploymentImageName(moduleConfig, undefined)
            const deploymentImageId = containerHelpers.getDeploymentImageId(moduleConfig, version, undefined)

            return {
              outputs: {
                "local-image-name": containerHelpers.getLocalImageName(moduleConfig),
                "local-image-id": containerHelpers.getLocalImageId(moduleConfig, version),
                "deployment-image-name": deploymentImageName,
                "deployment-image-id": deploymentImageId,
              },
            }
          },

          async hotReloadService(_: HotReloadServiceParams) {
            return {}
          },
        },
      },
    ],
    configSchema: providerConfigBaseSchema(),
    tools: [
      {
        name: "docker",
        description: "The official Docker CLI.",
        type: "binary",
        _includeInGardenImage: true,
        builds: [
          {
            platform: "darwin",
            architecture: "amd64",
            url: "https://download.docker.com/mac/static/stable/x86_64/docker-19.03.6.tgz",
            sha256: "82d279c6a2df05c2bb628607f4c3eacb5a7447be6d5f2a2f65643fbb6ed2f9af",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: "https://download.docker.com/linux/static/stable/x86_64/docker-19.03.6.tgz",
            sha256: "34ff89ce917796594cd81149b1777d07786d297ffd0fef37a796b5897052f7cc",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "windows",
            architecture: "amd64",
            url:
              "https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v19.03.6/docker-19.03.6.zip",
            sha256: "b4591baa2b7016af9ff3328a26146e4db3e6ce3fbe0503a7fd87363f29d63f5c",
            extract: {
              format: "zip",
              targetPath: "docker/docker.exe",
            },
          },
        ],
      },
    ],
  })
