/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { joi } from "../../config/common"
import { deline } from "../../util/string"
import { supportedVersions, defaultTerraformVersion } from "./cli"
import { Module } from "../../types/module"
import { ConfigureModuleParams } from "../../types/plugin/module/configure"
import { ConfigurationError, PluginError } from "../../exceptions"
import { dependenciesSchema } from "../../config/service"
import { DeployServiceParams } from "../../../src/types/plugin/service/deployService"
import { GetServiceStatusParams } from "../../../src/types/plugin/service/getServiceStatus"
import { getStackStatus, applyStack, noAutoApplyMsg, variablesSchema, TerraformBaseSpec, getTfOutputs } from "./common"
import { TerraformProvider } from "./terraform"
import { ServiceStatus } from "../../types/service"
import { baseBuildSpecSchema } from "../../config/module"

export interface TerraformModuleSpec extends TerraformBaseSpec {
  root: string
}

export interface TerraformModule extends Module<TerraformModuleSpec> {}

export const schema = joi.object().keys({
  build: baseBuildSpecSchema,
  autoApply: joi
    .boolean()
    .allow(null)
    .default(null).description(deline`
        If set to true, Garden will automatically run \`terraform apply -auto-approve\` when the stack is not
        up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing
        entirely.

        Defaults to the value set in the provider config.
      `),
  dependencies: dependenciesSchema,
  root: joi
    .posixPath()
    .subPathOnly()
    .default(".").description(deline`
        Specify the path to the working directory root—i.e. where your Terraform files are—relative to the module root.
      `),
  variables: variablesSchema.description(deline`
        A map of variables to use when applying the stack. You can define these here or you can place a
        \`terraform.tfvars\` file in the working directory root.

        If you specified \`variables\` in the \`terraform\` provider config, those will be included but the variables
        specified here take precedence.
      `),
  version: joi
    .string()
    .allow(...supportedVersions)
    .default(defaultTerraformVersion).description(deline`
        The version of Terraform to use. Defaults to the version set in the provider config.
      `),
})

export async function configureTerraformModule({ ctx, moduleConfig }: ConfigureModuleParams<TerraformModule>) {
  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(ctx.projectRoot, root)
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
  const autoApply = module.spec.autoApply
  const root = getModuleStackRoot(module)
  const variables = module.spec.variables
  const status = await getStackStatus({ log, provider, autoApply, root, variables })

  return {
    state: status.ready ? "ready" : "outdated",
    version: module.version.versionString,
    outputs: await getTfOutputs(log, provider.config.version, root),
    detail: {},
  }
}

export async function deployTerraform({
  ctx,
  log,
  module,
}: DeployServiceParams<TerraformModule>): Promise<ServiceStatus> {
  const provider = ctx.provider as TerraformProvider
  const root = getModuleStackRoot(module)

  if (module.spec.autoApply) {
    await applyStack(log, provider, root, module.spec.variables)

    return {
      state: "ready",
      version: module.version.versionString,
      outputs: await getTfOutputs(log, provider.config.version, root),
      detail: {},
    }
  } else {
    // This clause is here as a fail-safe, but shouldn't come up in normal usage because the status handler won't
    // trigger the deployment.
    throw new PluginError(`${module.name}: ${noAutoApplyMsg}`, {
      spec: module.spec,
      root,
    })
  }
}

function getModuleStackRoot(module: TerraformModule) {
  return join(module.path, module.spec.root)
}
