/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getServiceLogs } from "./logs"
import { runContainerModule, runContainerService, runContainerTask } from "./run"
import { execInService } from "./exec"
import { testContainerModule } from "./test"
import { ConfigurationError } from "../../../exceptions"
import { KubernetesProvider } from "../config"
import { ConfigureModuleParams } from "../../../plugin/handlers/module/configure"
import { getContainerDeployStatus } from "./status"
import { getTestResult } from "../test-results"
import { ContainerBuildAction, ContainerBuildOutputs, ContainerModule } from "../../container/moduleConfig"
import { getTaskResult } from "../task-results"
import { k8sPublishContainerModule } from "./publish"
import { getPortForwardHandler } from "../port-forward"
import { GetModuleOutputsParams } from "../../../plugin/handlers/module/get-outputs"
import { containerHelpers } from "../../container/helpers"
import { getContainerModuleOutputs } from "../../container/container"
import { getContainerBuildActionOutputs } from "../../container/build"

async function configure(params: ConfigureModuleParams<ContainerModule>) {
  let { moduleConfig } = await params.base!(params)
  params.moduleConfig = moduleConfig
  return validateConfig(params)
}

export const containerHandlers = {
  configure,
  getModuleOutputs: k8sGetContainerModuleOutputs,
  execInService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus: getContainerDeployStatus,
  getTestResult,
  publish: k8sPublishContainerModule,
  runModule: runContainerModule,
  runService: runContainerService,
  runTask: runContainerTask,
  getTaskResult,
  testModule: testContainerModule,
}

export async function k8sGetContainerModuleOutputs(params: GetModuleOutputsParams) {
  const { ctx, moduleConfig, version } = params
  const base = params.base || getContainerModuleOutputs
  const { outputs } = await base(params)

  const provider = <KubernetesProvider>ctx.provider
  outputs["deployment-image-name"] = containerHelpers.getDeploymentImageName(
    moduleConfig.name,
    moduleConfig.spec.image,
    provider.config.deploymentRegistry
  )
  outputs["deployment-image-id"] = containerHelpers.getModuleDeploymentImageId(
    moduleConfig,
    version,
    provider.config.deploymentRegistry
  )

  return { outputs }
}

export function k8sGetContainerBuildActionOutputs({
  provider,
  action,
}: {
  provider: KubernetesProvider
  action: ContainerBuildAction
}): ContainerBuildOutputs {
  const outputs = getContainerBuildActionOutputs(action)

  const localId = action.getSpec("localId")

  outputs.deploymentImageName = containerHelpers.getDeploymentImageName(
    action.name,
    localId,
    provider.config.deploymentRegistry
  )
  outputs.deploymentImageId = containerHelpers.getBuildDeploymentImageId(
    action.name,
    localId,
    action.version,
    provider.config.deploymentRegistry
  )

  return outputs
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
