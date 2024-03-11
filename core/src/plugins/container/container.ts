/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
import { Provider, GenericProviderConfig, providerConfigBaseSchema } from "../../config/provider"
import { isSubdir } from "../../util/util"
import { GetModuleOutputsParams } from "../../types/plugin/module/getModuleOutputs"
import { taskOutputsSchema } from "../kubernetes/task-results"

export interface ContainerProviderConfig extends GenericProviderConfig {}
export type ContainerProvider = Provider<ContainerProviderConfig>

export interface ContainerModuleOutputs {
  "local-image-name": string
  "local-image-id": string
  "deployment-image-name": string
  "deployment-image-id": string
}

export const dockerVersion = "25.0.2"

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
        // TODO-G2: change this to validation instead, require explicit dependency
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

export async function getContainerModuleOutputs({ moduleConfig, version }: GetModuleOutputsParams) {
  const deploymentImageName = containerHelpers.getDeploymentImageName(moduleConfig, undefined)
  const deploymentImageId = containerHelpers.getDeploymentImageId(moduleConfig, version, undefined)

  // If there is no Dockerfile (i.e. we don't need to build anything) we use the image field directly.
  // Otherwise we set the tag to the module version.
  const hasDockerfile = containerHelpers.hasDockerfile(moduleConfig, version)
  const localImageId =
    moduleConfig.spec.image && !hasDockerfile
      ? moduleConfig.spec.image
      : containerHelpers.getLocalImageId(moduleConfig, version)

  return {
    outputs: {
      "local-image-name": containerHelpers.getLocalImageName(moduleConfig),
      "local-image-id": localImageId,
      "deployment-image-name": deploymentImageName,
      "deployment-image-id": deploymentImageId,
    },
  }
}

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "container",
    docs: dedent`
    Provides the [container](../module-types/container.md) module type.
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
        other module types like [helm](./helm.md) or
        [kubernetes](./kubernetes.md).
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
          getModuleOutputs: getContainerModuleOutputs,

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
        description: `The official Docker CLI, v${dockerVersion}`,
        type: "binary",
        _includeInGardenImage: true,
        builds: [
          {
            platform: "darwin",
            architecture: "amd64",
            url: `https://download.docker.com/mac/static/stable/x86_64/docker-${dockerVersion}.tgz`,
            sha256: "3c7e0d69bd7bc78d39a48d6e2102979efdc128e1ee7e730be93e69ff7e389655",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "darwin",
            architecture: "arm64",
            url: `https://download.docker.com/mac/static/stable/aarch64/docker-${dockerVersion}.tgz`,
            sha256: "6b95f574215fc92608cdef7d83d4ab8ab17107b4eade95b2b915705bfc3260c7",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: `https://download.docker.com/linux/static/stable/x86_64/docker-${dockerVersion}.tgz`,
            sha256: "a83b394570052c12ac5255801b322676092b4985d82f4c1a92253f45de45dc99",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "linux",
            architecture: "arm64",
            url: `https://download.docker.com/linux/static/stable/aarch64/docker-${dockerVersion}.tgz`,
            sha256: "6a2cb41789469bc6ecddff22be014540f8a92fa0bee9fcf0771e3179ef3fc673",
            extract: {
              format: "tar",
              targetPath: "docker/docker",
            },
          },
          {
            platform: "windows",
            architecture: "amd64",
            url: `https://github.com/rgl/docker-ce-windows-binaries-vagrant/releases/download/v${dockerVersion}/docker-${dockerVersion}.zip`,
            sha256: "25ff5d9dd8ae176dd30fd97b0b99a896d598fa62fca0b7171b45887ad4d3661b",
            extract: {
              format: "zip",
              targetPath: "docker/docker.exe",
            },
          },
        ],
      }
    ],
  })
