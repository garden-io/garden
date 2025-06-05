/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pulumi } from "./cli.js"
import type { ProviderHandlers } from "@garden-io/sdk/build/src/types.js"
import {
  applyConfig,
  clearStackVersionTag,
  ensureEnv,
  getActionStackRoot,
  getPlanPath,
  getStackConfigPath,
  getStackOutputs,
  getStackStatusFromTag,
  selectStack,
  setStackVersionTag,
} from "./helpers.js"
import type { PulumiDeploy } from "./action.js"
import type { PulumiProvider } from "./provider.js"
import type { DeployActionHandlers } from "@garden-io/core/build/src/plugin/action-types.js"
import type { DeployState } from "@garden-io/core/build/src/types/service.js"
import { deployStateToActionState } from "@garden-io/core/build/src/plugin/handlers/Deploy/get-status.js"

export const cleanupEnvironment: ProviderHandlers["cleanupEnvironment"] = async (_params) => {
  // To properly implement this handler, we'd need access to the config graph (or at least the list of pulumi services
  // in the project), since we'd need to walk through them and delete each in turn.
  //
  // Instead, the `garden plugins pulumi destroy` command can be used.
  return {}
}

export const getPulumiDeployStatus: DeployActionHandlers<PulumiDeploy>["getStatus"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { cacheStatus } = action.getSpec()

  if (!cacheStatus) {
    return {
      state: deployStateToActionState("outdated"),
      outputs: {},
      detail: {
        state: "outdated",
        detail: {},
      },
    }
  }

  await selectStack(pulumiParams)
  const stackStatus = await getStackStatusFromTag(pulumiParams)

  const deployState: DeployState = stackStatus === "up-to-date" ? "ready" : "outdated"

  return {
    state: deployStateToActionState(deployState),
    outputs: await getStackOutputs(pulumiParams),
    detail: {
      state: deployState,
      detail: {},
    },
  }
}

export const deployPulumi: DeployActionHandlers<PulumiDeploy>["deploy"] = async ({ ctx, log, action }) => {
  const provider = ctx.provider as PulumiProvider
  const pulumiParams = { log, ctx, provider, action }
  const { autoApply, deployFromPreview, cacheStatus } = action.getSpec()

  if (!autoApply && !deployFromPreview) {
    log.info(`${action.longDescription()} has autoApply = false, but no planPath was provided. Skipping deploy.`)
    await selectStack(pulumiParams)
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
  const env = ensureEnv(pulumiParams)

  let planPath: string | null
  // TODO: does the plan include the backend config?
  if (deployFromPreview) {
    // A pulumi plan for this module has already been generated, so we use that.
    planPath = getPlanPath(ctx, action)
    log.verbose(`Deploying from plan at path ${planPath}`)
  } else {
    await applyConfig(pulumiParams)
    planPath = null
  }
  await selectStack(pulumiParams)
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
  if (cacheStatus) {
    await setStackVersionTag(pulumiParams)
  }

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
    log.warn(`${action.longDescription()} has allowDestroy = false. Skipping destroy.`)
    return {
      state: deployStateToActionState("outdated"),
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
  const env = ensureEnv(pulumiParams)
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
    state: deployStateToActionState("missing"),
    outputs: {},
    detail: {
      state: "missing",
      detail: {},
    },
  }
}
