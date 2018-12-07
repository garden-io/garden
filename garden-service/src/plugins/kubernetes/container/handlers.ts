/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deployContainerService, pushModule, deleteService } from "./deployment"
import { hotReloadContainer } from "../hot-reload"
import { getServiceLogs } from "./logs"
import { execInService, runContainerModule, runContainerService, runContainerTask } from "./run"
import { testContainerModule } from "./test"
import { ConfigurationError } from "../../../exceptions"
import { validateContainerModule } from "../../container/container"
import { KubernetesProvider } from "../kubernetes"
import { ValidateModuleParams } from "../../../types/plugin/params"
import { getContainerServiceStatus, getServiceOutputs } from "./status"
import { getTestResult } from "../test"
import { ContainerModule } from "../../container/config"

async function validate(params: ValidateModuleParams<ContainerModule>) {
  const config = await validateContainerModule(params)

  // validate ingress specs
  const provider: KubernetesProvider = params.ctx.provider

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

export const containerHandlers = {
  deployService: deployContainerService,
  deleteService,
  execInService,
  getServiceLogs,
  getServiceOutputs,
  getServiceStatus: getContainerServiceStatus,
  getTestResult,
  hotReloadService: hotReloadContainer,
  pushModule,
  runModule: runContainerModule,
  runService: runContainerService,
  runTask: runContainerTask,
  testModule: testContainerModule,
  validate,
}
