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
import { ModuleActionHandlers, ProviderHandlers } from "@garden-io/sdk/types"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import {
  applyConfig,
  clearStackVersionTag,
  getActionStackRoot,
  getPlanPath,
  getStackConfigPath,
  getStackOutputs,
  getStackStatusFromTag,
  selectStack,
  setStackVersionTag,
} from "./helpers"
import { PulumiDeploy, PulumiProvider } from "./config"
import chalk from "chalk"
import { DeployActionHandlers } from "@garden-io/core/build/src/plugin/action-types"

export const cleanupEnvironment: ProviderHandlers["cleanupEnvironment"] = async (_params) => {
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
      spec: moduleConfig.spec,
    },
  ]

  return { moduleConfig }
}

export const getPulumiDeployStatus: DeployActionHandlers<PulumiDeploy>["getStatus"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { cacheStatus } = action.getSpec()

  if (!cacheStatus) {
    return {
      state: "outdated",
      outputs: {},
      detail: {
        state: "outdated",
        detail: {},
      },
    }
  }

  await selectStack(pulumiParams)
  const stackStatus = await getStackStatusFromTag(pulumiParams)

  const state = stackStatus === "up-to-date" ? "ready" : "outdated"

  return {
    state,
    outputs: await getStackOutputs(pulumiParams),
    detail: {
      state,
      detail: {},
    },
  }
}

export const deployPulumi: DeployActionHandlers<PulumiDeploy>["deploy"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { autoApply, deployFromPreview } = action.getSpec()

  await selectStack(pulumiParams)

  if (!autoApply && !deployFromPreview) {
    log.info(`${action.longDescription()} has autoApply = false, but no planPath was provided. Skipping deploy.`)
    return {
      state: "ready",
      outputs: await getStackOutputs(pulumiParams),
      detail: {
        state: "ready",
        detail: {},
      },
    }
  }

  const root = getActionStackRoot(action)
  const env = defaultPulumiEnv

  let planPath: string | null
  if (deployFromPreview) {
    // A pulumi plan for this module has already been generated, so we use that.
    planPath = getPlanPath(ctx, action)
    log.verbose(`Deploying from plan at path ${planPath}`)
  } else {
    await applyConfig(pulumiParams)
    planPath = null
  }
  log.verbose(`Applying pulumi stack...`)
  const upArgs = ["up", "--yes", "--color", "always", "--config-file", getStackConfigPath(action, ctx.environmentName)]
  planPath && upArgs.push("--plan", planPath)
  await pulumi(ctx, provider).spawnAndStreamLogs({
    args: upArgs,
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when applying pulumi stack",
  })
  await setStackVersionTag(pulumiParams)

  return {
    state: "ready",
    outputs: await getStackOutputs(pulumiParams),
    detail: {
      state: "ready",
      detail: {},
    },
  }
}

export const deletePulumiDeploy: DeployActionHandlers<PulumiDeploy>["delete"] = async ({ ctx, log, action }) => {
  if (!action.getSpec("allowDestroy")) {
    log.warn(chalk.yellow(`${action.longDescription()} has allowDestroy = false. Skipping destroy.`))
    return {
      state: "outdated",
      outputs: {},
      detail: {
        state: "outdated",
        detail: {},
      },
    }
  }
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const root = getActionStackRoot(action)
  const env = defaultPulumiEnv
  await selectStack(pulumiParams)

  const cli = pulumi(ctx, provider)
  await selectStack(pulumiParams)
  log.verbose(`Destroying pulumi stack...`)
  await cli.spawnAndStreamLogs({
    args: ["destroy", "--yes", "--config-file", getStackConfigPath(action, ctx.environmentName)],
    cwd: root,
    log,
    env,
    ctx,
    errorPrefix: "Error when destroying pulumi stack",
  })
  await clearStackVersionTag(pulumiParams)

  return {
    state: "not-ready",
    outputs: {},
    detail: {
      state: "missing",
      detail: {},
    },
  }
}
