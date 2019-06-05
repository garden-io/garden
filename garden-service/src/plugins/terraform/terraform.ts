/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { GardenPlugin } from "../../types/plugin/plugin"
import { getEnvironmentStatus, prepareEnvironment } from "./init"
import { providerConfigBaseSchema, ProviderConfig, Provider } from "../../config/provider"
import { joi } from "../../config/common"
import { deline, dedent } from "../../util/string"
import { supportedVersions, defaultTerraformVersion } from "./cli"
import { ConfigureProviderParams, ConfigureProviderResult } from "../../types/plugin/provider/configureProvider"
import { ConfigurationError } from "../../exceptions"
import { variablesSchema, TerraformBaseSpec } from "./common"
import { describeTerraformModuleType, configureTerraformModule, getTerraformStatus, deployTerraform } from "./module"

type TerraformProviderConfig = ProviderConfig & TerraformBaseSpec & {
  initRoot?: string,
}

export interface TerraformProvider extends Provider<TerraformProviderConfig> { }

const configSchema = providerConfigBaseSchema
  .keys({
    autoApply: joi.boolean()
      .default(false)
      .description(deline`
        If set to true, Garden will automatically run \`terraform apply -auto-approve\` when a stack is not
        up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing
        entirely.
      `),
    initRoot: joi.string()
      .posixPath({ subPathOnly: true })
      .description(dedent`
        Specify the path to a Terraform config directory, that should be resolved when initializing the provider.
        This is useful when other providers need to be able to reference the outputs from the stack.

        See the [Terraform guide](../../using-garden/terraform.md) for more information.
      `),
    // When you provide variables directly in \`terraform\` modules, those variables will
    // extend the ones specified here, and take precedence if the keys overlap.
    variables: variablesSchema
      .description(deline`
        A map of variables to use when applying Terraform stacks. You can define these here, in individual
        \`terraform\` module configs, or you can place a \`terraform.tfvars\` file in each working directory.
      `),
    // May be overridden by individual \`terraform\` modules.
    version: joi.string()
      .allow(...supportedVersions)
      .default(defaultTerraformVersion)
      .description(deline`
        The version of Terraform to use.
      `),
  })
  .unknown(false)

export const gardenPlugin = (): GardenPlugin => ({
  configSchema,
  actions: {
    configureProvider,
    getEnvironmentStatus,
    prepareEnvironment,
  },
  moduleActions: {
    terraform: {
      describeType: describeTerraformModuleType,
      configure: configureTerraformModule,
      // FIXME: it should not be strictly necessary to provide this handler
      build: async () => ({}),
      getServiceStatus: getTerraformStatus,
      deployService: deployTerraform,
    },
  },
})

async function configureProvider(
  { config, projectRoot }: ConfigureProviderParams<TerraformProviderConfig>,
): Promise<ConfigureProviderResult> {
  // Make sure the configured root path exists, if it is set
  if (config.initRoot) {
    const absRoot = join(projectRoot, config.initRoot)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError(
        `Terraform: configured initRoot config directory '${config.initRoot}' does not exist`,
        { config, projectRoot },
      )
    }
  }

  return { config }
}
