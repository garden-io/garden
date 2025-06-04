/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import fsExtra from "fs-extra"
const { pathExists } = fsExtra
import { joi } from "@garden-io/core/build/src/config/common.js"
import type { GardenModule, ModuleActionHandlers, PluginContext } from "@garden-io/sdk/build/src/types.js"
import { ConfigurationError } from "@garden-io/sdk/build/src/exceptions.js"
import { dependenciesSchema } from "@garden-io/core/build/src/config/service.js"
import type { TerraformBaseSpec } from "./helpers.js"
import type { TerraformProvider, TerraformProviderConfig } from "./provider.js"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module.js"
import { terraformDeploySchemaKeys } from "./action.js"

export interface TerraformModuleSpec extends TerraformBaseSpec {
  root: string
  dependencies: string[]
}

export type TerraformModule = GardenModule<TerraformModuleSpec>

type TerraformModuleConfig = TerraformModule["_config"]

export const terraformModuleSchema = () =>
  joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: dependenciesSchema(),
    ...terraformDeploySchemaKeys(),
  })

export const configureTerraformModule: ModuleActionHandlers<TerraformModule>["configure"] = async (params) => {
  const ctx = params.ctx as PluginContext<TerraformProviderConfig>
  const moduleConfig = params.moduleConfig as TerraformModuleConfig
  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(moduleConfig.path, root)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError({
        message: `Terraform: configured working directory '${root}' does not exist`,
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
      spec: moduleConfig.spec,
    },
  ]

  return { moduleConfig }
}
