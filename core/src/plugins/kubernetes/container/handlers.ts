/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigurationError } from "../../../exceptions"
import { KubernetesProvider } from "../config"
import { ConfigureModuleParams } from "../../../plugin/handlers/module/configure"
import {
  ContainerBuildAction,
  ContainerBuildOutputs,
  ContainerDeploySpec,
  ContainerModule,
  ContainerServiceSpec,
} from "../../container/moduleConfig"
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
  const localId = action.getSpec("localId")

  const outputs = getContainerBuildActionOutputs({
    buildName: action.name,
    localId,
    version: action.getFullVersion(),
  })

  outputs.deploymentImageName = containerHelpers.getDeploymentImageName(
    action.name,
    localId,
    provider.config.deploymentRegistry
  )
  outputs.deploymentImageId = containerHelpers.getBuildDeploymentImageId(
    action.name,
    localId,
    action.getFullVersion(),
    provider.config.deploymentRegistry
  )

  return outputs
}

// TODO-G2: handle at action level as well
function validateConfig<T extends ContainerModule>(params: ConfigureModuleParams<T>) {
  // validate ingress specs
  const moduleConfig = params.moduleConfig
  const provider = <KubernetesProvider>params.ctx.provider

  for (const serviceConfig of moduleConfig.serviceConfigs) {
    validateDeploySpec(serviceConfig.name, provider, serviceConfig.spec)
  }

  return { moduleConfig }
}

export function validateDeploySpec(
  name: string,
  provider: KubernetesProvider,
  spec: ContainerServiceSpec | ContainerDeploySpec
) {
  for (const ingressSpec of spec.ingresses) {
    const hostname = ingressSpec.hostname || provider.config.defaultHostname

    if (!hostname) {
      throw new ConfigurationError(
        `No hostname configured for one of the ingresses on service/deploy ${name}. ` +
          `Please configure a default hostname or specify a hostname for the ingress.`,
        {
          name,
          ingressSpec,
        }
      )
    }

    // make sure the hostname is set
    ingressSpec.hostname = hostname
  }
}
