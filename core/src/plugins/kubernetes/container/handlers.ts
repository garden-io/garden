/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigurationError } from "../../../exceptions.js"
import type { KubernetesProvider } from "../config.js"
import type { ConfigureModuleParams } from "../../../plugin/handlers/Module/configure.js"
import type {
  ContainerBuildAction,
  ContainerBuildOutputs,
  ContainerDeploySpec,
  ContainerModule,
  ContainerServiceSpec,
} from "../../container/moduleConfig.js"
import type { GetModuleOutputsParams } from "../../../plugin/handlers/Module/get-outputs.js"
import { containerHelpers } from "../../container/helpers.js"
import { getContainerModuleOutputs } from "../../container/container.js"
import type { Resolved } from "../../../actions/types.js"

async function configure(params: ConfigureModuleParams<ContainerModule>) {
  const { moduleConfig } = await params.base!(params)
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
  action: Resolved<ContainerBuildAction>
}): ContainerBuildOutputs {
  return containerHelpers.getBuildActionOutputs(action, provider.config.deploymentRegistry)
}

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
      throw new ConfigurationError({
        message:
          `No hostname configured for one of the ingresses on service/deploy ${name}. ` +
          `Please configure a default hostname or specify a hostname for the ingress.`,
      })
    }

    // make sure the hostname is set
    ingressSpec.hostname = hostname
  }
}
