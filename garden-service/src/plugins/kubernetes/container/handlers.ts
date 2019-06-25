/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deployContainerService, deleteService } from "./deployment"
import { hotReloadContainer } from "../hot-reload"
import { getServiceLogs } from "./logs"
import { execInService, runContainerModule, runContainerService, runContainerTask } from "./run"
import { testContainerModule } from "./test"
import { ConfigurationError } from "../../../exceptions"
import { configureContainerModule } from "../../container/container"
import { KubernetesProvider } from "../config"
import { ConfigureModuleParams } from "../../../types/plugin/module/configure"
import { getContainerServiceStatus } from "./status"
import { getTestResult } from "../test-results"
import { ContainerModule } from "../../container/config"
import { configureMavenContainerModule, MavenContainerModule } from "../../maven-container/maven-container"
import { getTaskResult } from "../task-results"
import { k8sBuildContainer, k8sGetContainerBuildStatus } from "./build"
import { k8sPublishContainerModule } from "./publish"

async function configure(params: ConfigureModuleParams<ContainerModule>) {
  params.moduleConfig = await configureContainerModule(params)
  return validateConfig(params)
}

// TODO: avoid having to special-case this (needs framework improvements)
export async function configureMaven(params: ConfigureModuleParams<MavenContainerModule>) {
  params.moduleConfig = await configureMavenContainerModule(params)
  return validateConfig(params)
}

export const containerHandlers = {
  configure,
  build: k8sBuildContainer,
  deployService: deployContainerService,
  deleteService,
  execInService,
  getBuildStatus: k8sGetContainerBuildStatus,
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

export const mavenContainerHandlers = {
  ...containerHandlers,
  configure: configureMaven,
}

async function validateConfig<T extends ContainerModule>(params: ConfigureModuleParams<T>) {
  // validate ingress specs
  const config = params.moduleConfig
  const provider = <KubernetesProvider>params.ctx.provider

  for (const serviceConfig of config.serviceConfigs) {
    for (const ingressSpec of serviceConfig.spec.ingresses) {
      const hostname = ingressSpec.hostname || provider.config.defaultHostname

      if (!hostname) {
        throw new ConfigurationError(
          `No hostname configured for one of the ingresses on service ${serviceConfig.name}. ` +
          `Please configure a default hostname or specify a hostname for the ingress.`,
          {
            serviceName: serviceConfig.name,
            ingressSpec,
          },
        )
      }

      // make sure the hostname is set
      ingressSpec.hostname = hostname
    }
  }

  return config
}
