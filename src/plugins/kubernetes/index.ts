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
  ProviderConfig,
  providerConfigBase,
} from "../../types/project"

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
  getLoginStatus,
  login,
  logout,
  runModule,
} from "./actions"
import { deployService } from "./deployment"
import { kubernetesSpecHandlers } from "./specs-module"

export const name = "kubernetes"

export interface KubernetesConfig extends ProviderConfig {
  context: string
  ingressHostname: string
  ingressPort: number
  ingressClass: string
  forceSsl: boolean
}

export interface KubernetesProvider extends Provider<KubernetesConfig> { }

const kubernetesConfigBase = providerConfigBase
  .keys({
    context: Joi.string()
      .required()
      .description("The kubectl context to use to connect to the Kubernetes cluster."),
    ingressHostname: Joi.string()
      .hostname()
      .required()
      .description("The external hostname of the cluster's ingress controller."),
  })

const configSchema = kubernetesConfigBase
  .keys({
    ingressPort: Joi.number()
      .default(80)
      .description("The external port of the cluster's ingress controller."),
    ingressClass: Joi.string()
      .description("The ingress class to use on configured Ingresses when deploying services."),
    forceSsl: Joi.boolean()
      .default(true)
      .description("Whether to force use of SSL in configured Ingresses when deploying services."),
    _system: Joi.any().meta({ internal: true }),
  })

export function gardenPlugin({ config }: { config: KubernetesConfig }): GardenPlugin {
  config = validate(config, configSchema, { context: "kubernetes provider config" })

  return {
    config,
    actions: {
      getEnvironmentStatus,
      configureEnvironment,
      destroyEnvironment,
      getConfig,
      setConfig,
      deleteConfig,
      getLoginStatus,
      login,
      logout,
    },
    moduleActions: {
      container: {
        getServiceStatus,
        deployService,
        getServiceOutputs,
        execInService,
        runModule,
        testModule,
        getTestResult,
        getServiceLogs,
      },
      "kubernetes-specs": kubernetesSpecHandlers,
    },
  }
}
