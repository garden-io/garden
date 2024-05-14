/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { mapValues, startCase } from "lodash-es"

import { ConfigurationError, PluginError, RuntimeError } from "@garden-io/sdk/build/src/exceptions.js"
import type { Log, PluginContext } from "@garden-io/sdk/build/src/types.js"
import { dedent } from "@garden-io/sdk/build/src/util/string.js"
import { terraform } from "./cli.js"
import type { TerraformProvider } from "./provider.js"
import fsExtra from "fs-extra"
const { writeFile } = fsExtra
import type { PrimitiveMap } from "@garden-io/core/build/src/config/common.js"
import { joi, joiStringMap } from "@garden-io/core/build/src/config/common.js"
import split2 from "split2"
import { styles } from "@garden-io/core/build/src/logger/styles.js"

export const variablesSchema = () => joiStringMap(joi.any())

export interface TerraformBaseSpec {
  allowDestroy: boolean
  autoApply: boolean
  variables: PrimitiveMap
  version: string | null
  workspace?: string
}

interface TerraformParams {
  ctx: PluginContext
  log: Log
  provider: TerraformProvider
  root: string
}

interface TerraformParamsWithWorkspace extends TerraformParams {
  workspace: string | null
}

interface TerraformParamsWithVariables extends TerraformParamsWithWorkspace {
  variables: object
}

/**
 * Validates the stack at the given root.
 *
 * Note that this does not set the workspace, so it must be set ahead of calling the function.
 */
export async function tfValidate(params: TerraformParams) {
  const { log, ctx, provider, root } = params

  const args = ["validate", "-json"]
  const res = await terraform(ctx, provider).json({
    log,
    args,
    ignoreError: true,
    cwd: root,
  })

  if (res.valid === false) {
    // We need to run `terraform init` and retry validation
    log.debug(`Validation failed, trying to run "terraform init".`)
    let retryRes: any
    let initError: any
    try {
      await terraform(ctx, provider).exec({ log, args: ["init"], cwd: root, timeoutSec: 600 })
      retryRes = await terraform(ctx, provider).json({
        log,
        args,
        ignoreError: true,
        cwd: root,
      })
    } catch (error) {
      // We catch the error thrown by the terraform init request
      log.debug("Terraform init failed with error: ${error.message}")
      initError = error
    }

    // If the original validate request has failed and there is an error thrown by the init request
    // OR the second validate try has failed, we throw a new ConfigurationError.
    if ((res?.valid === false && initError) || retryRes?.valid === false) {
      let errorMsg = dedent`Failed validating Terraform configuration:`

      // It failed when running "terraform init": in this case we only add the error from the
      // first validation try
      if (initError) {
        const resultErrors = res.diagnostics.map(
          (d: any) => `${startCase(d.severity)}: ${d.summary}\n${d.detail || ""}`
        )
        errorMsg += dedent`\n\n${resultErrors.join("\n")}

    Garden tried running "terraform init" but got the following error:\n
    ${initError.message}`
      } else {
        // "terraform init" went through but there is still a validation error afterwards so we
        // add the retry error.
        const resultErrors = retryRes.diagnostics.map(
          (d: any) => `${startCase(d.severity)}: ${d.summary}\n${d.detail || ""}`
        )
        errorMsg += dedent`\n\n${resultErrors.join("\n")}`
      }

      throw new ConfigurationError({ message: errorMsg })
    }
  }
}

/**
 * Returns the output from the Terraform stack.
 *
 * Note that this does not set the workspace, so it must be set ahead of calling the function.
 */
export async function getTfOutputs(params: TerraformParams) {
  const { log, ctx, provider, root } = params

  const res = await terraform(ctx, provider).json({
    log,
    args: ["output", "-json"],
    cwd: root,
  })

  return mapValues(res, (v: any) => v.value)
}

export function getRoot(ctx: PluginContext, provider: TerraformProvider) {
  return resolve(ctx.projectRoot, provider.config.initRoot || ".")
}

type StackStatus = "up-to-date" | "outdated" | "error"

/**
 * Checks and returns the status of a Terraform stack.
 *
 * Note: If `autoApply` is set to `false` and the stack is not ready, we still return `ready: true` and log a warning,
 * since the user may want to manually update their stacks. The `autoApply` flag is only for information, and setting
 * it to `true` does _not_ mean this method will apply the change.
 */
export async function getStackStatus(params: TerraformParamsWithVariables): Promise<StackStatus> {
  const { ctx, log, provider, root, variables } = params

  await setWorkspace(params)
  await tfValidate(params)

  const statusLog = log.createLog({ name: "terraform" }).info("Running plan...")

  const plan = await terraform(ctx, provider).exec({
    log,
    ignoreError: true,
    args: [
      "plan",
      "-detailed-exitcode",
      "-input=false",
      // We don't refresh here, and trust the state. Users can manually run plan if they need the state refreshed.
      "-refresh=false",
      // No reason to lock the state file here since we won't modify it.
      "-lock=false",
      ...(await prepareVariables(root, variables)),
    ],
    cwd: root,
  })

  if (plan.exitCode === 0) {
    // Stack is up-to-date
    statusLog.success(styles.success("Stack up-to-date"))
    return "up-to-date"
  } else if (plan.exitCode === 1) {
    // Error from terraform. This can, for example, happen if variables are missing or there are errors in the tf files.
    // We ignore this here and carry on. Following commands will output the same error.
    statusLog.error(`Failed running plan`)
    return "error"
  } else if (plan.exitCode === 2) {
    // No error but stack is not up-to-date
    statusLog.warn({ msg: "Not up-to-date" })
    return "outdated"
  } else {
    statusLog.error(`Failed running plan`)
    throw new PluginError({
      message: `Unexpected exit code ${plan.exitCode} from \`terraform plan\`. This is the full output:\n\n${plan.all}`,
    })
  }
}

export async function applyStack(params: TerraformParamsWithVariables) {
  const { ctx, log, provider, root, variables } = params

  await setWorkspace(params)

  const args = ["apply", "-auto-approve", "-input=false", ...(await prepareVariables(root, variables))]
  const proc = await terraform(ctx, provider).spawn({ log, args, cwd: root })

  const statusLine = log.createLog({}).info("→ Applying Terraform stack...")
  const logStream = split2()

  let stderr = ""

  if (proc.stderr) {
    proc.stderr.pipe(logStream)
    proc.stderr.on("data", (data) => {
      stderr += data
    })
  }

  if (proc.stdout) {
    proc.stdout.pipe(logStream)
  }

  logStream.on("data", (line: Buffer) => {
    statusLine.info(styles.primary("→ " + line.toString()))
  })

  await new Promise<void>((_resolve, reject) => {
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (code === 0) {
        _resolve()
      } else {
        reject(
          new RuntimeError({
            message: `Terraform failed with exit code ${code} when applying Terraform stack:\n${stderr}`,
          })
        )
      }
    })
  })
}

/**
 * If any variables are specified in the Garden config, this prepares a .tfvars file to use and returns the
 * appropriate arguments to pass to the Terraform CLI, otherwise an empty array.
 */
export async function prepareVariables(targetDir: string, variables?: object): Promise<string[]> {
  if (Object.entries(variables || {}).length === 0) {
    return []
  }

  const path = resolve(targetDir, "garden.tfvars.json")
  await writeFile(path, JSON.stringify(variables))

  return ["-var-file", path]
}

/**
 * Lists the created workspaces for the given Terraform `root`, and returns which one is selected.
 */
export async function getWorkspaces(params: TerraformParams) {
  const { ctx, log, provider, root } = params

  // Must in some cases ensure init is complete before listing workspaces
  await terraform(ctx, provider).exec({ log, args: ["init"], cwd: root, timeoutSec: 600 })

  const res = await terraform(ctx, provider).stdout({ args: ["workspace", "list"], cwd: root, log })
  let selected = "default"

  const workspaces = res
    .trim()
    .split("\n")
    .map((line) => {
      let name: string

      if (line.startsWith("*")) {
        name = line.trim().slice(2)
        selected = name
      } else {
        name = line.trim()
      }

      return name
    })

  return { workspaces, selected }
}

/**
 * Sets the workspace to use in the Terraform `root`, creating it if it doesn't already exist. Does nothing if
 * no `workspace` is set.
 */
export async function setWorkspace(params: TerraformParamsWithWorkspace) {
  const { ctx, provider, root, log, workspace } = params

  if (!workspace) {
    return
  }

  const { workspaces, selected } = await getWorkspaces(params)

  if (selected === workspace) {
    return
  }

  if (workspaces.includes(workspace)) {
    await terraform(ctx, provider).stdout({ args: ["workspace", "select", workspace], cwd: root, log })
  } else {
    await terraform(ctx, provider).stdout({ args: ["workspace", "new", workspace], cwd: root, log })
  }
}
