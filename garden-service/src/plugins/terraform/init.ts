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

export async function getEnvironmentStatus({ ctx, log }: GetEnvironmentStatusParams): Promise<EnvironmentStatus> {
  const provider = ctx.provider as TerraformProvider

  if (!provider.config.initRoot) {
    // Nothing to do!
    return { ready: true, outputs: {} }
  }

  const autoApply = provider.config.autoApply
  const root = getRoot(ctx, provider)
  const variables = provider.config.variables

  return getStackStatus({ log, provider, autoApply, root, variables })
}

export async function prepareEnvironment({ ctx, log }: PrepareEnvironmentParams): Promise<PrepareEnvironmentResult> {
  const provider = ctx.provider as TerraformProvider

  if (!provider.config.initRoot) {
    // Nothing to do!
    return { status: { ready: true, outputs: {} } }
  }

  const tfVersion = provider.config.version
  const root = getRoot(ctx, provider)

  if (provider.config.autoApply) {
    await applyStack(log, provider, root, provider.config.variables)
  }

  const outputs = await getTfOutputs(log, tfVersion, root)

  return {
    status: {
      ready: true,
      outputs,
    },
  }
}
