/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TerraformProvider } from "./provider.js"
import { applyStack, getRoot, getStackStatus, getTfOutputs, prepareVariables, setWorkspace } from "./helpers.js"
import { deline } from "@garden-io/sdk/build/src/util/string.js"
import type { ProviderHandlers } from "@garden-io/sdk/build/src/types.js"
import { terraform } from "./cli.js"
import { styles } from "@garden-io/core/build/src/logger/styles.js"

export const getEnvironmentStatus: ProviderHandlers["getEnvironmentStatus"] = async ({ ctx, log }) => {
  const provider = ctx.provider as TerraformProvider

  // Return if there is no root stack, or if we're running one of the terraform plugin commands
  if (!provider.config.initRoot) {
    return { ready: true, outputs: {} }
  }

  const autoApply = provider.config.autoApply
  const root = getRoot(ctx, provider)
  const variables = provider.config.variables
  const workspace = provider.config.workspace || null

  const status = await getStackStatus({ log, ctx, provider, root, variables, workspace })

  if (status === "up-to-date") {
    const outputs = await getTfOutputs({ log, ctx, provider, root })
    return { ready: true, outputs }
  } else if (status === "outdated") {
    if (autoApply) {
      return { ready: false, outputs: {} }
    } else {
      log.warn(deline`
        Terraform stack is not up-to-date and ${styles.underline("autoApply")} is not enabled. Please run
        ${styles.accent.bold("garden plugins terraform apply-root")} to make sure the stack is in the intended state.
      `)
      const outputs = await getTfOutputs({ log, ctx, provider, root })
      // Make sure the status is not cached when the stack is not up-to-date
      return { ready: true, outputs, disableCache: true }
    }
  } else {
    return { ready: false, outputs: {} }
  }
}

export const prepareEnvironment: ProviderHandlers["prepareEnvironment"] = async ({ ctx, log }) => {
  const provider = ctx.provider as TerraformProvider

  if (!provider.config.initRoot) {
    // Nothing to do!
    return { status: { ready: true, outputs: {} } }
  }

  const envStatus = await getEnvironmentStatus({ ctx, log })
  if (envStatus.ready) {
    return {
      status: envStatus,
    }
  }

  const root = getRoot(ctx, provider)
  const workspace = provider.config.workspace || null

  // Don't run apply when running plugin commands
  if (provider.config.autoApply && !(ctx.command?.name === "plugins" && ctx.command?.args.plugin === provider.name)) {
    await applyStack({ ctx, log, provider, root, variables: provider.config.variables, workspace })
  }

  const outputs = await getTfOutputs({ log, ctx, provider, root })

  return {
    status: {
      ready: true,
      outputs,
    },
  }
}

export const cleanupEnvironment: ProviderHandlers["cleanupEnvironment"] = async ({ ctx, log }) => {
  const provider = ctx.provider as TerraformProvider

  if (!provider.config.initRoot) {
    // Nothing to do!
    return {}
  }

  if (!provider.config.allowDestroy) {
    log.warn("allowDestroy is set to false. Not calling terraform destroy for root stack.")
    return {}
  }

  const root = getRoot(ctx, provider)
  const variables = provider.config.variables
  const workspace = provider.config.workspace || null

  await setWorkspace({ ctx, provider, root, log, workspace })

  const args = ["destroy", "-auto-approve", "-input=false", ...(await prepareVariables(root, variables))]
  await terraform(ctx, provider).exec({ log, args, cwd: root })

  return {}
}
