/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "@garden-io/core/build/src/config/common"
import { GardenModule, ModuleActionHandlers, PluginContext } from "@garden-io/sdk/types"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module"
import { dependenciesSchema } from "@garden-io/core/build/src/config/service"
import { pulumiDeploySchemaKeys, PulumiDeploySpec } from "./action"
import { PulumiProvider, PulumiProviderConfig } from "./provider"
import { join } from "path"
import { pathExists } from "fs-extra"
import { ConfigurationError } from "@garden-io/core/build/src/exceptions"

export interface PulumiModuleSpec extends PulumiDeploySpec {
  dependencies: string[]
}

export interface PulumiModule extends GardenModule<PulumiModuleSpec> {}

type PulumiModuleConfig = PulumiModule["_config"]

export const pulumiModuleSchema = () =>
  joi.object().keys({
    build: baseBuildSpecSchema(),
    dependencies: dependenciesSchema(),
    ...pulumiDeploySchemaKeys(),
  })

export const configurePulumiModule: ModuleActionHandlers<PulumiModule>["configure"] = async (params) => {
  const ctx = params.ctx as PluginContext<PulumiProviderConfig>
  const moduleConfig = params.moduleConfig as PulumiModuleConfig

  // Make sure the configured root path exists
  const root = moduleConfig.spec.root
  if (root) {
    const absRoot = join(moduleConfig.path, root)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError({
        message: `Pulumi: configured working directory '${root}' does not exist`,
        detail: {
          moduleConfig,
        },
      })
    }
  }

  const provider = ctx.provider as PulumiProvider
  const backendUrl = provider.config.backendURL
  const orgName = moduleConfig.spec.orgName || provider.config.orgName

  // Check to avoid using `orgName` or `cacheStatus: true` with non-pulumi managed backends
  if (!backendUrl.startsWith("https://")) {
    if (orgName) {
      throw new ConfigurationError({
        message: "Pulumi: orgName is not supported for self-managed backends",
        detail: {
          moduleConfig,
          providerConfig: provider.config,
        },
      })
    }

    if (moduleConfig.spec.cacheStatus) {
      throw new ConfigurationError({
        message: "Pulumi: `cacheStatus: true` is not supported for self-managed backends",
        detail: {
          moduleConfig,
          providerConfig: provider.config,
        },
      })
    }
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
