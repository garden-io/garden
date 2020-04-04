/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TerraformProvider } from "./terraform"
import { GetEnvironmentStatusParams, EnvironmentStatus } from "../../types/plugin/provider/getEnvironmentStatus"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "../../types/plugin/provider/prepareEnvironment"
import { getRoot, getTfOutputs, getStackStatus, applyStack } from "./common"
import chalk from "chalk"
import { deline } from "../../util/string"

export async function getEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams): Promise<EnvironmentStatus> {
  const provider = ctx.provider as TerraformProvider

  // Return if there is no root stack, or if we're running one of the terraform plugin commands
  if (!provider.config.initRoot) {
    return { ready: true, outputs: {} }
  }

  const autoApply = provider.config.autoApply
  const root = getRoot(ctx, provider)
  const variables = provider.config.variables
  const tfVersion = provider.config.version

  const status = await getStackStatus({ log, provider, root, variables })

  if (status === "up-to-date") {
    const outputs = await getTfOutputs(log, tfVersion, root)
    return { ready: true, outputs }
  } else if (status === "outdated") {
    if (autoApply) {
      return { ready: false, outputs: {} }
    } else {
      log.warn({
        symbol: "warning",
        msg: chalk.yellow(deline`
          Terraform stack is not up-to-date and ${chalk.underline("autoApply")} is not enabled. Please run
          ${chalk.white.bold("garden plugins terraform apply-root")} to make sure the stack is in the intended state.
        `),
      })
      const outputs = await getTfOutputs(log, tfVersion, root)
      return { ready: true, outputs }
    }
  } else {
    return { ready: false, outputs: {} }
  }
}

export async function prepareEnvironment({ ctx, log }: PrepareEnvironmentParams): Promise<PrepareEnvironmentResult> {
  const provider = ctx.provider as TerraformProvider

  if (!provider.config.initRoot) {
    // Nothing to do!
    return { status: { ready: true, outputs: {} } }
  }

  const tfVersion = provider.config.version
  const root = getRoot(ctx, provider)

  // Don't run apply when running plugin commands
  if (provider.config.autoApply && !(ctx.command?.name === "plugins" && ctx.command?.args.plugin === provider.name)) {
    await applyStack({ log, root, variables: provider.config.variables, version: provider.config.version })
  }

  const outputs = await getTfOutputs(log, tfVersion, root)

  return {
    status: {
      ready: true,
      outputs,
    },
  }
}
