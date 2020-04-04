/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { getEnvironmentStatus, prepareEnvironment } from "./init"
import { providerConfigBaseSchema, ProviderConfig, Provider } from "../../config/provider"
import { joi } from "../../config/common"
import { dedent } from "../../util/string"
import { supportedVersions, defaultTerraformVersion } from "./cli"
import { ConfigureProviderParams, ConfigureProviderResult } from "../../types/plugin/provider/configureProvider"
import { ConfigurationError } from "../../exceptions"
import { variablesSchema, TerraformBaseSpec } from "./common"
import { schema, configureTerraformModule, getTerraformStatus, deployTerraform } from "./module"
import { DOCS_BASE_URL } from "../../constants"
import { SuggestModulesParams, SuggestModulesResult } from "../../types/plugin/module/suggestModules"
import { listDirectory } from "../../util/fs"
import { terraformCommands } from "./commands"

type TerraformProviderConfig = ProviderConfig &
  TerraformBaseSpec & {
    initRoot?: string
  }

export interface TerraformProvider extends Provider<TerraformProviderConfig> {}

const configSchema = providerConfigBaseSchema()
  .keys({
    autoApply: joi.boolean().default(false).description(dedent`
        If set to true, Garden will automatically run \`terraform apply -auto-approve\` when a stack is not up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.

        **Note: This is not recommended for production, or shared environments in general!**
      `),
    initRoot: joi.posixPath().subPathOnly().description(dedent`
        Specify the path to a Terraform config directory, that should be resolved when initializing the provider. This is useful when other providers need to be able to reference the outputs from the stack.

        See the [Terraform guide](${DOCS_BASE_URL}/advanced/terraform) for more information.
      `),
    // When you provide variables directly in \`terraform\` modules, those variables will
    // extend the ones specified here, and take precedence if the keys overlap.
    variables: variablesSchema().description(dedent`
        A map of variables to use when applying Terraform stacks. You can define these here, in individual
        \`terraform\` module configs, or you can place a \`terraform.tfvars\` file in each working directory.
      `),
    // May be overridden by individual \`terraform\` modules.
    version: joi
      .string()
      .allow(...supportedVersions)
      .default(defaultTerraformVersion).description(dedent`
        The version of Terraform to use.
      `),
  })
  .unknown(false)

// Need to make these variables to avoid escaping issues
const serviceOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const providerOutputsTemplateString = "${providers.terraform.outputs.<key>}"

export const gardenPlugin = createGardenPlugin({
  name: "terraform",
  docs: dedent`
    This provider allows you to integrate Terraform stacks into your Garden project. See the [Terraform guide](${DOCS_BASE_URL}/advanced/terraform) for details and usage information.
  `,
  configSchema,
  handlers: {
    configureProvider,
    getEnvironmentStatus,
    prepareEnvironment,
  },
  commands: terraformCommands,
  createModuleTypes: [
    {
      name: "terraform",
      docs: dedent`
      Resolves a Terraform stack and either applies it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date.

      **Note: It is not recommended to set \`autoApply\` to \`true\` for any production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually plan and apply using the provided plugin commands. Run \`garden plugins terraform\` for details.

      Stack outputs are made available as service outputs, that can be referenced by other modules under \`${serviceOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.

      Note that you can also declare a Terraform root in the \`terraform\` provider configuration by setting the \`initRoot\` parameter. This may be preferable if you need the outputs of the Terraform stack to be available to other provider configurations, e.g. if you spin up an environment with the Terraform provider, and then use outputs from that to configure another provider or other modules via \`${providerOutputsTemplateString}\` template strings.

      See the [Terraform guide](${DOCS_BASE_URL}/advanced/terraform) for a high-level introduction to the \`terraform\` provider.
    `,
      serviceOutputsSchema: joi
        .object()
        .pattern(/.+/, joi.any())
        .description("A map of all the outputs defined in the Terraform stack."),
      schema,
      handlers: {
        suggestModules: async ({ name, path }: SuggestModulesParams): Promise<SuggestModulesResult> => {
          const files = await listDirectory(path, { recursive: false })

          if (files.filter((f) => f.endsWith(".tf")).length > 0) {
            return {
              suggestions: [
                {
                  description: `based on found .tf files`,
                  module: {
                    type: "terraform",
                    name,
                    autoApply: false,
                  },
                },
              ],
            }
          } else {
            return { suggestions: [] }
          }
        },
        configure: configureTerraformModule,
        getServiceStatus: getTerraformStatus,
        deployService: deployTerraform,
      },
    },
  ],
})

async function configureProvider({
  config,
  projectRoot,
}: ConfigureProviderParams<TerraformProviderConfig>): Promise<ConfigureProviderResult> {
  // Make sure the configured root path exists, if it is set
  if (config.initRoot) {
    const absRoot = join(projectRoot, config.initRoot)
    const exists = await pathExists(absRoot)

    if (!exists) {
      throw new ConfigurationError(
        `Terraform: configured initRoot config directory '${config.initRoot}' does not exist`,
        { config, projectRoot }
      )
    }
  }

  return { config }
}
