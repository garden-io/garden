/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { defaultPulumiEnv, pulumi } from "./cli"
import { ModuleActionHandlers, PluginActionHandlers, ServiceActionHandlers } from "@garden-io/sdk/types"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import {
  applyConfig,
  clearStackVersionTag,
  getModuleStackRoot,
  getPlanPath,
  getStackConfigPath,
  getStackOutputs,
  getStackStatusFromTag,
  selectStack,
  setStackVersionTag,
} from "./helpers"
import { PulumiModule, PulumiProvider } from "./config"
import { ServiceStatus } from "@garden-io/core/build/src/types/service"
import chalk from "chalk"

export const cleanupEnvironment: PluginActionHandlers["cleanupEnvironment"] = async (_params) => {
  // To properly implement this handler, we'd need access to the config graph (or at least the list of pulumi services
  // in the project), since we'd need to walk through them and delete each in turn.
  //
  // Instead, the `garden plugins pulumi destroy` command can be used.
  return {}
}

export const configurePulumiModule: ModuleActionHandlers["configure"] = async ({ ctx, moduleConfig }) => {
  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(moduleConfig.path, root)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError(`Pulumi: configured working directory '${root}' does not exist`, {
        moduleConfig,
      })
    }
  }

  const provider = ctx.provider as PulumiProvider

  if (!moduleConfig.spec.version) {
    moduleConfig.spec.version = provider.config.version
  }

  moduleConfig.serviceConfigs = [
    {
      name: moduleConfig.name,
      dependencies: moduleConfig.spec.dependencies,
      disabled: false,
      hotReloadable: false,
      spec: moduleConfig.spec,
    },
  ]

  return { moduleConfig }
}

export const getPulumiServiceStatus: ServiceActionHandlers["getServiceStatus"] = async ({
  ctx,
  log,
  module,
  service,
}) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiModule: PulumiModule = module
  const pulumiParams = { log, ctx, provider, module: pulumiModule }
  const { deployFromPreview, cacheStatus } = pulumiModule.spec
  const serviceVersion = service.version

  if (!cacheStatus) {
    return {
      state: "outdated",
      version: serviceVersion,
      outputs: {},
      detail: {},
    }
  }

  await selectStack(pulumiParams)
  const stackStatus = await getStackStatusFromTag({ ...pulumiParams, serviceVersion })
  if (deployFromPreview && stackStatus === "up-to-date") {
    return {
      state: "ready",
      version: serviceVersion,
      outputs: await getStackOutputs(pulumiParams),
      detail: {},
    }
  }

  const serviceStatus: ServiceStatus = {
    state: stackStatus === "up-to-date" ? "ready" : "outdated",
    version: serviceVersion,
    outputs: await getStackOutputs(pulumiParams),
    detail: {},
  }
  return serviceStatus
}

export const deployPulumiService: ServiceActionHandlers["deployService"] = async ({ ctx, log, module, service }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiModule: PulumiModule = module
  const pulumiParams = { log, ctx, provider, module: pulumiModule }
  const { autoApply, deployFromPreview } = pulumiModule.spec
  const serviceVersion = service.version
  await selectStack(pulumiParams)

  if (!autoApply && !deployFromPreview) {
    log.info(`${pulumiModule.name} has autoApply = false, but no planPath was provided. Skipping deploy.`)
    return {
      state: "ready",
      version: serviceVersion,
      outputs: await getStackOutputs(pulumiParams),
      detail: {},
    }
  }

  const root = getModuleStackRoot(pulumiModule)
  const env = defaultPulumiEnv

  let planPath: string | null
  if (deployFromPreview) {
    // A pulumi plan for this module has already been generated, so we use that.
    planPath = getPlanPath(ctx, pulumiModule)
    log.verbose(`Deploying from plan at path ${planPath}`)
  } else {
    await applyConfig(pulumiParams)
    planPath = null
  }
  log.verbose(`Applying pulumi stack...`)
  const upArgs = [
    "up",
    "--yes",
    "--color",
    "always",
    "--config-file",
    getStackConfigPath(pulumiModule, ctx.environmentName),
  ]
  planPath && upArgs.push("--plan", planPath)
  await pulumi(ctx, provider).spawnAndStreamLogs({
    args: upArgs,
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when applying pulumi stack",
  })
  await setStackVersionTag({ ...pulumiParams, serviceVersion })

  return {
    state: "ready",
    version: serviceVersion,
    outputs: await getStackOutputs(pulumiParams),
    detail: {},
  }
}

export const deletePulumiService: ServiceActionHandlers["deleteService"] = async ({ ctx, log, module, service }) => {
  const pulumiModule: PulumiModule = module
  if (!pulumiModule.spec.allowDestroy) {
    log.warn(chalk.yellow(`${pulumiModule.name} has allowDestroy = false. Skipping destroy.`))
    return {
      state: "outdated",
      version: service.version,
      outputs: {},
      detail: {},
    }
  }
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, module: pulumiModule }
  const root = getModuleStackRoot(pulumiModule)
  const env = defaultPulumiEnv
  await selectStack(pulumiParams)

  const cli = pulumi(ctx, provider)
  await selectStack(pulumiParams)
  log.verbose(`Destroying pulumi stack...`)
  await cli.spawnAndStreamLogs({
    args: ["destroy", "--yes", "--config-file", getStackConfigPath(pulumiModule, ctx.environmentName)],
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when destroying pulumi stack",
  })
  await clearStackVersionTag(pulumiParams)

  return {
    state: "missing",
    version: service.version,
    outputs: {},
    detail: {},
  }
}
