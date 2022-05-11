/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { joi } from "@garden-io/core/build/src/config/common"
import { dedent, deline } from "@garden-io/sdk/util/string"
import { supportedVersions, terraform } from "./cli"
import { GardenModule, ModuleActionHandlers, ServiceActionHandlers } from "@garden-io/sdk/types"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import { dependenciesSchema } from "@garden-io/core/build/src/config/service"
import {
  applyStack,
  getStackStatus,
  getTfOutputs,
  prepareVariables,
  setWorkspace,
  TerraformBaseSpec,
  variablesSchema,
} from "./common"
import { TerraformProvider } from "."
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module"
import chalk from "chalk"

export interface TerraformModuleSpec extends TerraformBaseSpec {
  root: string
}

export interface TerraformModule extends GardenModule<TerraformModuleSpec> {}

export const terraformModuleSchema = () =>
  joi.object().keys({
    build: baseBuildSpecSchema(),
    allowDestroy: joi.boolean().default(false).description(dedent`
    If set to true, Garden will run \`terraform destroy\` on the stack when calling \`garden delete env\` or \`garden delete service <module name>\`.
  `),
    autoApply: joi.boolean().allow(null).default(null).description(dedent`
        If set to true, Garden will automatically run \`terraform apply -auto-approve\` when the stack is not
        up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing
        entirely.

        **NOTE: This is not recommended for production, or shared environments in general!**

        Defaults to the value set in the provider config.
      `),
    dependencies: dependenciesSchema(),
    root: joi.posixPath().subPathOnly().default(".").description(dedent`
        Specify the path to the working directory root—i.e. where your Terraform files are—relative to the module root.
      `),
    variables: variablesSchema().description(dedent`
        A map of variables to use when applying the stack. You can define these here or you can place a
        \`terraform.tfvars\` file in the working directory root.

        If you specified \`variables\` in the \`terraform\` provider config, those will be included but the variables
        specified here take precedence.
      `),
    version: joi.string().allow(...supportedVersions, null).description(dedent`
      The version of Terraform to use. Defaults to the version set in the provider config.
      Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
    `),
    workspace: joi.string().allow(null).description("Use the specified Terraform workspace."),
  })

export const configureTerraformModule: ModuleActionHandlers["configure"] = async ({ ctx, moduleConfig }) => {
  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(moduleConfig.path, root)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError(`Terraform: configured working directory '${root}' does not exist`, {
        moduleConfig,
      })
    }
  }

  const provider = ctx.provider as TerraformProvider

  // Use the provider config if no value is specified for the module
  if (moduleConfig.spec.autoApply === null) {
    moduleConfig.spec.autoApply = provider.config.autoApply
  }
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

export const getTerraformStatus: ServiceActionHandlers["getServiceStatus"] = async ({ ctx, log, module, service }) => {
  const provider = ctx.provider as TerraformProvider
  const root = getModuleStackRoot(module)
  const variables = module.spec.variables
  const workspace = module.spec.workspace || null

  const status = await getStackStatus({
    ctx,
    log,
    provider,
    root,
    variables,
    workspace,
  })

  return {
    state: status === "up-to-date" ? "ready" : "outdated",
    version: service.version,
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {},
  }
}

export const deployTerraform: ServiceActionHandlers["deployService"] = async ({ ctx, log, module, service }) => {
  const provider = ctx.provider as TerraformProvider
  const workspace = module.spec.workspace || null
  const root = getModuleStackRoot(module)

  if (module.spec.autoApply) {
    await applyStack({ log, ctx, provider, root, variables: module.spec.variables, workspace })
  } else {
    const templateKey = `\${runtime.services.${module.name}.outputs.*}`
    log.warn(
      chalk.yellow(
        deline`
        Stack is out-of-date but autoApply is set to false, so it will not be applied automatically. If any newly added
        stack outputs are referenced via ${templateKey} template strings and are missing,
        you may see errors when resolving them.
        `
      )
    )
    await setWorkspace({ log, ctx, provider, root, workspace })
  }

  return {
    state: "ready",
    version: service.version,
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {},
  }
}

export const deleteTerraformModule: ServiceActionHandlers["deleteService"] = async ({ ctx, log, module, service }) => {
  const provider = ctx.provider as TerraformProvider

  if (!module.spec.allowDestroy) {
    log.warn({ section: module.name, msg: "allowDestroy is set to false. Not calling terraform destroy." })
    return {
      state: "outdated",
      detail: {},
    }
  }

  const root = getModuleStackRoot(module)
  const variables = module.spec.variables
  const workspace = module.spec.workspace || null

  await setWorkspace({ ctx, provider, root, log, workspace })

  const args = ["destroy", "-auto-approve", "-input=false", ...(await prepareVariables(root, variables))]
  await terraform(ctx, provider).exec({ log, args, cwd: root })

  return {
    state: "missing",
    version: service.version,
    outputs: {},
    detail: {},
  }
}

function getModuleStackRoot(module: TerraformModule) {
  return join(module.path, module.spec.root)
}
