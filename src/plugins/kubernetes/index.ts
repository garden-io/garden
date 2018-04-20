/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { validate } from "../../types/common"
import {
  GardenPlugin,
  Provider,
} from "../../types/plugin"

import {
  configureEnvironment,
  deleteConfig,
  destroyEnvironment,
  execInService,
  getConfig,
  getEnvironmentStatus,
  getServiceLogs,
  getServiceOutputs,
  getServiceStatus,
  getTestResult,
  setConfig,
  testModule,
} from "./actions"
import { deployService } from "./deployment"
import { kubernetesSpecHandlers } from "./specs-module"

export const name = "kubernetes"

export interface KubernetesConfig {
  context: string
  ingressHostname: string
  ingressClass: string
  forceSsl: boolean
  _system?: Symbol
}

export interface KubernetesProvider extends Provider<KubernetesConfig> { }

const configSchema = Joi.object().keys({
  context: Joi.string().required(),
  ingressHostname: Joi.string().hostname().required(),
  ingressClass: Joi.string(),
  forceSsl: Joi.boolean().default(true),
  _system: Joi.any(),
})

export function gardenPlugin({ config }: { config: KubernetesConfig }): GardenPlugin {
  config = validate(config, configSchema, "kubernetes provider config")

  return {
    config,
    actions: {
      getEnvironmentStatus,
      configureEnvironment,
      destroyEnvironment,
      getConfig,
      setConfig,
      deleteConfig,
    },
    moduleActions: {
      container: {
        getServiceStatus,
        deployService,
        getServiceOutputs,
        execInService,
        testModule,
        getTestResult,
        getServiceLogs,
      },
      "kubernetes-specs": kubernetesSpecHandlers,
    },
  }
}
