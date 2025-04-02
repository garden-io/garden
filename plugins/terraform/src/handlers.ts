/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { deline } from "@garden-io/core/build/src/util/string.js"
import { terraform } from "./cli.js"
import {
  applyStack,
  getStackStatus,
  getTfOutputs,
  prepareVariables,
  ensureWorkspace,
  ensureTerraformInit,
} from "./helpers.js"
import type { TerraformProvider } from "./provider.js"
import type { DeployActionHandler } from "@garden-io/core/build/src/plugin/action-types.js"
import type { DeployState } from "@garden-io/core/build/src/types/service.js"
import { deployStateToActionState } from "@garden-io/core/build/src/plugin/handlers/Deploy/get-status.js"
import type { TerraformDeploy, TerraformDeploySpec } from "./action.js"
import { styles } from "@garden-io/core/build/src/logger/styles.js"

export const getTerraformStatus: DeployActionHandler<"getStatus", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const root = getModuleStackRoot(action, spec)

  const variables = spec.variables
  const workspace = spec.workspace || null

  await ensureWorkspace({ log, ctx, provider, root, workspace })
  await ensureTerraformInit({ log, ctx, provider, root, backendConfig: spec.backendConfig })

  const status = await getStackStatus({
    ctx,
    log,
    provider,
    root,
    variables,
    workspace,
  })

  const deployState: DeployState = status === "up-to-date" ? "ready" : "outdated"

  return {
    state: deployStateToActionState(deployState),
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {
      state: deployState,
      detail: {},
    },
  }
}

export const deployTerraform: DeployActionHandler<"deploy", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const workspace = spec.workspace || null
  const root = getModuleStackRoot(action, spec)

  if (spec.autoApply) {
    await ensureWorkspace({ log, ctx, provider, root, workspace })
    await ensureTerraformInit({ log, ctx, provider, root, backendConfig: spec.backendConfig })
    await applyStack({ log, ctx, provider, root, variables: spec.variables, workspace, actionName: action.name })
  } else {
    const templateKey = `\${runtime.services.${action.name}.outputs.*}`
    log.warn(
      styles.warning(
        deline`
        Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added
        stack outputs are referenced via ${templateKey} template strings and are missing,
        you may see errors when resolving them.
        `
      )
    )
    await ensureWorkspace({ log, ctx, provider, root, workspace })
  }

  return {
    state: "ready",
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {
      state: "ready",
      detail: {},
    },
  }
}

export const deleteTerraformModule: DeployActionHandler<"delete", TerraformDeploy> = async ({ ctx, log, action }) => {
  const provider = ctx.provider as TerraformProvider
  const spec = action.getSpec()
  const deployState: DeployState = "outdated"

  if (!spec.allowDestroy) {
    log.warn("allowDestroy is set to false. Not calling terraform destroy.")
    return {
      state: deployStateToActionState(deployState),
      detail: {
        state: deployState,
        detail: {},
      },
      outputs: {},
    }
  }

  const root = getModuleStackRoot(action, spec)
  const variables = spec.variables
  const workspace = spec.workspace || null

  await ensureWorkspace({ ctx, provider, root, log, workspace })

  const args = ["destroy", "-auto-approve", "-input=false", ...(await prepareVariables(root, variables))]
  await terraform(ctx, provider).exec({ log, args, cwd: root })

  return {
    state: "not-ready",
    outputs: {},
    detail: {
      state: "missing",
      detail: {},
    },
  }
}

function getModuleStackRoot(action: TerraformDeploy, spec: TerraformDeploySpec) {
  // TODO-G2: doublecheck this path
  return join(action.getBuildPath(), spec.root)
}
