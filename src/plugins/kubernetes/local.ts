/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  every,
  values,
} from "lodash"
import * as Joi from "joi"
import { validate } from "../../types/common"
import {
  ConfigureEnvironmentParams,
  GardenPlugin,
  GetEnvironmentStatusParams,
} from "../../types/plugin"
import { providerConfigBase } from "../../types/project"
import { findByName } from "../../util"
import {
  configureEnvironment,
  getEnvironmentStatus,
} from "./actions"
import {
  gardenPlugin as k8sPlugin,
  KubernetesConfig,
} from "./index"
import {
  getSystemGarden,
  isSystemGarden,
} from "./system"

// extend the environment configuration to also set up an ingress controller and dashboard
export async function getLocalEnvironmentStatus(
  { ctx, provider, env, logEntry }: GetEnvironmentStatusParams,
) {
  const status = await getEnvironmentStatus({ ctx, provider, env, logEntry })

  if (!isSystemGarden(provider)) {
    const sysGarden = await getSystemGarden(provider)
    const sysStatus = await sysGarden.pluginContext.getStatus()

    status.detail.systemReady = sysStatus.providers[provider.name].configured &&
      every(values(sysStatus.services).map(s => s.state === "ready"))
  }

  status.configured = every(values(status.detail))

  return status
}

async function configureLocalEnvironment(
  { ctx, provider, env, status, logEntry }: ConfigureEnvironmentParams,
) {
  await configureEnvironment({ ctx, provider, env, status, logEntry })

  if (!isSystemGarden(provider)) {
    const sysGarden = await getSystemGarden(provider)
    const sysProvider = {
      name: provider.name,
      config: findByName(sysGarden.config.providers, provider.name),
    }
    const sysStatus = await getEnvironmentStatus({
      ctx: sysGarden.pluginContext,
      provider: sysProvider,
      env,
    })
    await configureEnvironment({
      ctx: sysGarden.pluginContext,
      env: sysGarden.getEnvironment(),
      provider: sysProvider,
      status: sysStatus,
      logEntry,
    })
    await sysGarden.pluginContext.deployServices({ logEntry })
  }
}

export const name = "local-kubernetes"

const configSchema = providerConfigBase.keys({
  context: Joi.string().default("docker-for-desktop"),
  _system: Joi.any(),
})

export function gardenPlugin({ config }): GardenPlugin {
  config = validate(config, configSchema, { context: "kubernetes provider config" })

  const k8sConfig: KubernetesConfig = {
    name: config.name,
    context: config.context,
    ingressHostname: "local.app.garden",
    ingressClass: "nginx",
    // TODO: support SSL on local deployments
    forceSsl: false,
    _system: config._system,
  }

  const plugin = k8sPlugin({ config: k8sConfig })

  plugin.actions!.getEnvironmentStatus = getLocalEnvironmentStatus
  plugin.actions!.configureEnvironment = configureLocalEnvironment

  return plugin
}
