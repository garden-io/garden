/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import { keyBy } from "lodash"

import { ConfigurationError } from "../../exceptions"
import { GardenPlugin } from "../../types/plugin/plugin"
import { containerHelpers } from "./helpers"
import { ContainerModule, containerModuleSpecSchema } from "./config"
import { buildContainerModule, getContainerBuildStatus } from "./build"
import { KubernetesProvider } from "../kubernetes/config"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { HotReloadServiceParams } from "../../types/plugin/service/hotReloadService"
import { joi } from "../../config/common"
import { publishContainerModule } from "./publish"

export const containerModuleOutputsSchema = joi.object()
  .keys({
    "local-image-name": joi.string()
      .required()
      .description(
        "The name of the image (without tag/version) that the module uses for local builds and deployments.",
      )
      .example("my-module"),
    "deployment-image-name": joi.string()
      .required()
      .description("The name of the image (without tag/version) that the module will use during deployment.")
      .example("my-deployment-registry.io/my-org/my-module"),
  })

export async function configureContainerModule({ ctx, moduleConfig }: ConfigureModuleParams<ContainerModule>) {
  // validate hot reload configuration
  // TODO: validate this when validating this action's output
  const hotReloadConfig = moduleConfig.spec.hotReload

  if (hotReloadConfig) {
    const invalidPairDescriptions: string[] = []
    const targets = hotReloadConfig.sync.map(syncSpec => syncSpec.target)

    // Verify that sync targets are mutually disjoint - i.e. that no target is a subdirectory of
    // another target. Mounting directories into mounted directories will cause unexpected results
    for (const t of targets) {
      for (const t2 of targets) {
        if (t2.startsWith(t) && t !== t2) {
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
        { invalidPairDescriptions, hotReloadConfig },
      )
    }
  }

  const hotReloadable = !!moduleConfig.spec.hotReload

  // validate services
  moduleConfig.serviceConfigs = moduleConfig.spec.services.map(spec => {
    // make sure ports are correctly configured
    const name = spec.name
    const definedPorts = spec.ports
    const portsByName = keyBy(spec.ports, "name")

    for (const ingress of spec.ingresses) {
      const ingressPort = ingress.port

      if (!portsByName[ingressPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${ingressPort} defined in ingress`,
          { definedPorts, ingressPort },
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.httpGet) {
      const healthCheckHttpPort = spec.healthCheck.httpGet.port

      if (!portsByName[healthCheckHttpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckHttpPort} defined in httpGet health check`,
          { definedPorts, healthCheckHttpPort },
        )
      }
    }

    if (spec.healthCheck && spec.healthCheck.tcpPort) {
      const healthCheckTcpPort = spec.healthCheck.tcpPort

      if (!portsByName[healthCheckTcpPort]) {
        throw new ConfigurationError(
          `Service ${name} does not define port ${healthCheckTcpPort} defined in tcpPort health check`,
          { definedPorts, healthCheckTcpPort },
        )
      }
    }

    return {
      name,
      dependencies: spec.dependencies,
      hotReloadable,
      spec,
    }
  })

  moduleConfig.testConfigs = moduleConfig.spec.tests.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map(t => ({
    name: t.name,
    dependencies: t.dependencies,
    spec: t,
    timeout: t.timeout,
  }))

  const provider = <KubernetesProvider>ctx.provider
  const deploymentImageName = await containerHelpers.getDeploymentImageName(
    moduleConfig,
    provider.config.deploymentRegistry,
  )

  moduleConfig.outputs = {
    "local-image-name": await containerHelpers.getLocalImageName(moduleConfig),
    "deployment-image-name": deploymentImageName,
  }

  return moduleConfig
}

export const gardenPlugin = (): GardenPlugin => ({
  moduleActions: {
    container: {
      describeType,
      configure: configureContainerModule,
      getBuildStatus: getContainerBuildStatus,
      build: buildContainerModule,
      publish: publishContainerModule,

      async hotReloadService(_: HotReloadServiceParams) {
        return {}
      },

    },
  },
})

async function describeType() {
  return {
    docs: dedent`
      Specify a container image to build or pull from a remote registry.
      You may also optionally specify services to deploy, tasks or tests to run inside the container.

      Note that the runtime services have somewhat limited features in this module type. For example, you cannot
      specify replicas for redundancy, and various platform-specific options are not included. For those, look at
      other module types like [helm](https://docs.garden.io/reference/module-types/helm) or
      [kubernetes](https://github.com/garden-io/garden/blob/master/docs/reference/module-types/kubernetes.md).
    `,
    outputsSchema: containerModuleOutputsSchema,
    schema: containerModuleSpecSchema,
  }
}
