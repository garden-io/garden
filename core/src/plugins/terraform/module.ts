/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { joi } from "../../config/common"
import { dedent, deline } from "../../util/string"
import { supportedVersions, terraform } from "./cli"
import { GardenModule } from "../../types/module"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { ConfigurationError } from "../../exceptions"
import { dependenciesSchema } from "../../config/service"
import { DeployServiceParams } from "../../../src/types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../../src/types/plugin/service/getServiceStatus"
import {
  getStackStatus,
  applyStack,
  variablesSchema,
  TerraformBaseSpec,
  getTfOutputs,
  prepareVariables,
  setWorkspace,
} from "./common"
import { TerraformProvider } from "./terraform"
import { ServiceStatus } from "../../types/service"
import { baseBuildSpecSchema } from "../../config/module"
import chalk = require("chalk")
import { DeleteServiceParams } from "../../types/plugin/service/deleteService"

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

        If you specified \`variables\` in the \`terraform\` provider config, those will be included but the variables
        specified here take precedence.
      `),
    version: joi.string().allow(...supportedVersions, null).description(dedent`
      The version of Terraform to use. Defaults to the version set in the provider config.
      Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
    `),
    workspace: joi.string().allow(null).description("Use the specified Terraform workspace."),
  })

export async function configureTerraformModule({ ctx, moduleConfig }: ConfigureModuleParams<TerraformModule>) {
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

export async function getTerraformStatus({
  ctx,
  log,
  module,
}: GetServiceStatusParams<TerraformModule>): Promise<ServiceStatus> {
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
    version: module.version.versionString,
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {},
  }
}

export async function deployTerraform({
  ctx,
  log,
  module,
}: DeployServiceParams<TerraformModule>): Promise<ServiceStatus> {
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
    version: module.version.versionString,
    outputs: await getTfOutputs({ log, ctx, provider, root }),
    detail: {},
  }
}

export async function deleteTerraformModule({
  ctx,
  log,
  module,
}: DeleteServiceParams<TerraformModule>): Promise<ServiceStatus> {
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
    version: module.version.versionString,
    outputs: {},
    detail: {},
  }
}

function getModuleStackRoot(module: TerraformModule) {
  return join(module.path, module.spec.root)
}
