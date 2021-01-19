/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deployContainerService, deleteService } from "./deployment"
import { hotReloadContainer } from "../hot-reload/hot-reload"
import { getServiceLogs } from "./logs"
import { runContainerModule, runContainerService, runContainerTask } from "./run"
import { execInService } from "./exec"
import { testContainerModule } from "./test"
import { ConfigurationError } from "../../../exceptions"
import { configureContainerModule } from "../../container/container"
import { KubernetesProvider } from "../config"
import { ConfigureModuleParams } from "../../../types/plugin/module/configure"
import { getContainerServiceStatus } from "./status"
import { getTestResult } from "../test-results"
import { ContainerModule } from "../../container/config"
import { getTaskResult } from "../task-results"
import { k8sBuildContainer, k8sGetContainerBuildStatus } from "./build/build"
import { k8sPublishContainerModule } from "./publish"
import { getPortForwardHandler } from "../port-forward"
import { GetModuleOutputsParams } from "../../../types/plugin/module/getModuleOutputs"
import { containerHelpers } from "../../container/helpers"

async function configure(params: ConfigureModuleParams<ContainerModule>) {
  let { moduleConfig } = await configureContainerModule(params)
  params.moduleConfig = moduleConfig
  return validateConfig(params)
}

export const containerHandlers = {
  configure,
  getModuleOutputs,
  build: k8sBuildContainer,
  deployService: deployContainerService,
  deleteService,
  execInService,
  getBuildStatus: k8sGetContainerBuildStatus,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus: getContainerServiceStatus,
  getTestResult,
  hotReloadService: hotReloadContainer,
  publish: k8sPublishContainerModule,
  runModule: runContainerModule,
  runService: runContainerService,
  runTask: runContainerTask,
  getTaskResult,
  testModule: testContainerModule,
}

async function getModuleOutputs(params: GetModuleOutputsParams) {
  const { ctx, moduleConfig, version, base } = params
  const { outputs } = await base!(params)

  const provider = <KubernetesProvider>ctx.provider
  outputs["deployment-image-name"] = containerHelpers.getDeploymentImageName(
    moduleConfig,
    provider.config.deploymentRegistry
  )
  outputs["deployment-image-id"] = containerHelpers.getDeploymentImageId(
    moduleConfig,
    version,
    provider.config.deploymentRegistry
  )

  return { outputs }
}

async function validateConfig<T extends ContainerModule>(params: ConfigureModuleParams<T>) {
  // validate ingress specs
  const moduleConfig = params.moduleConfig
  const provider = <KubernetesProvider>params.ctx.provider

  for (const serviceConfig of moduleConfig.serviceConfigs) {
    for (const ingressSpec of serviceConfig.spec.ingresses) {
      const hostname = ingressSpec.hostname || provider.config.defaultHostname

      if (!hostname) {
        throw new ConfigurationError(
          `No hostname configured for one of the ingresses on service ${serviceConfig.name}. ` +
            `Please configure a default hostname or specify a hostname for the ingress.`,
          {
            serviceName: serviceConfig.name,
            ingressSpec,
          }
        )
      }

      // make sure the hostname is set
      ingressSpec.hostname = hostname
    }
  }

  return { moduleConfig }
}
