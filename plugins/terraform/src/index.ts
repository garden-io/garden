/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { omit } from "lodash"
import { pathExists } from "fs-extra"
import { createGardenPlugin } from "@garden-io/sdk"
import { cleanupEnvironment, getEnvironmentStatus, prepareEnvironment } from "./init"
import { dedent } from "@garden-io/sdk/build/src/util/string"
import { defaultTerraformVersion, terraformCliSpecs } from "./cli"
import { ConfigurationError } from "@garden-io/sdk/build/src/exceptions"
import { configureTerraformModule, TerraformModule, terraformModuleSchema } from "./module"
import { docsBaseUrl } from "@garden-io/sdk/build/src/constants"
import { getTerraformCommands } from "./commands"
import { TerraformDeployConfig, terraformDeployOutputsSchema, terraformDeploySchema } from "./action"
import { deleteTerraformModule, deployTerraform, getTerraformStatus } from "./handlers"
import { DOCS_BASE_URL } from "@garden-io/core/build/src/constants"
import { ExecBuildConfig } from "@garden-io/core/build/src/plugins/exec/build"
import { ConvertModuleParams } from "@garden-io/core/build/src/plugin/handlers/Module/convert"
import { TerraformProvider, TerraformProviderConfig, terraformProviderConfigSchema } from "./provider"
import { PluginContext } from "@garden-io/core/build/src/plugin-context"

// Need to make these variables to avoid escaping issues
const deployOutputsTemplateString = "${deploys.<deploy-name>.outputs.<key>}"
const serviceOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const providerOutputsTemplateString = "${providers.terraform.outputs.<key>}"

const defaultTerraformTimeoutSec = 600

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "terraform",
    docs: dedent`
    This provider allows you to integrate Terraform stacks into your Garden project. See the [Terraform guide](${docsBaseUrl}/advanced/terraform) for details and usage information.
  `,
    configSchema: terraformProviderConfigSchema,

    commands: getTerraformCommands(),

    handlers: {
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,

      async configureProvider({ config, projectRoot }) {
        // Make sure the configured root path exists, if it is set
        if (config.initRoot) {
          const absRoot = join(projectRoot, config.initRoot)
          const exists = await pathExists(absRoot)

          if (!exists) {
            throw new ConfigurationError({
              message: `Terraform: configured initRoot config directory '${config.initRoot}' does not exist`,
            })
          }
        }

        return { config }
      },
    },

    createActionTypes: {
      Deploy: [
        {
          name: "terraform",
          docs: dedent`
          Resolves a Terraform stack and either applies it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date.

          **Note: It is not recommended to set \`autoApply\` to \`true\` for any production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually plan and apply using the provided plugin commands. Run \`garden plugins terraform\` for details.

          Stack outputs are made available as service outputs, that can be referenced by other actions under \`${deployOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.

          Note that you can also declare a Terraform root in the \`terraform\` provider configuration by setting the \`initRoot\` parameter. This may be preferable if you need the outputs of the Terraform stack to be available to other provider configurations, e.g. if you spin up an environment with the Terraform provider, and then use outputs from that to configure another provider or other actions via \`${providerOutputsTemplateString}\` template strings.

          See the [Terraform guide](${DOCS_BASE_URL}/advanced/terraform) for a high-level introduction to the \`terraform\` provider.
          `,
          schema: terraformDeploySchema(),
          runtimeOutputsSchema: terraformDeployOutputsSchema(),
          handlers: {
            configure: async (params) => {
              const ctx = params.ctx as PluginContext<TerraformProviderConfig>
              const config = params.config as TerraformProviderConfig
              const provider = ctx.provider as TerraformProvider

              // Use the provider config if no value is specified for the module
              if (config.spec.autoApply === null) {
                config.spec.autoApply = provider.config.autoApply
              }
              if (!config.spec.version) {
                config.spec.version = provider.config.version
              }

              return { config, supportedModes: {} }
            },

            validate: async ({ action }) => {
              const root = action.getSpec("root")
              if (root) {
                const absRoot = join(action.sourcePath(), root)
                const exists = await pathExists(absRoot)

                if (!exists) {
                  throw new ConfigurationError({
                    message: `Terraform: configured root directory '${root}' does not exist`,
                  })
                }
              }
              return {}
            },

            deploy: deployTerraform,
            getStatus: getTerraformStatus,
            delete: deleteTerraformModule,
          },
        },
      ],
    },

    createModuleTypes: [
      {
        name: "terraform",
        docs: dedent`
      Resolves a Terraform stack and either applies it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date.

      **Note: It is not recommended to set \`autoApply\` to \`true\` for any production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually plan and apply using the provided plugin commands. Run \`garden plugins terraform\` for details.

      Stack outputs are made available as service outputs, that can be referenced by other modules under \`${serviceOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.

      Note that you can also declare a Terraform root in the \`terraform\` provider configuration by setting the \`initRoot\` parameter. This may be preferable if you need the outputs of the Terraform stack to be available to other provider configurations, e.g. if you spin up an environment with the Terraform provider, and then use outputs from that to configure another provider or other modules via \`${providerOutputsTemplateString}\` template strings.

      See the [Terraform guide](${docsBaseUrl}/advanced/terraform) for a high-level introduction to the \`terraform\` provider.
    `,
        schema: terraformModuleSchema(),
        needsBuild: false,
        handlers: {
          configure: configureTerraformModule,

          async convert(params: ConvertModuleParams<TerraformModule>) {
            const { module, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
            const actions: (ExecBuildConfig | TerraformDeployConfig)[] = []

            if (dummyBuild) {
              actions.push(dummyBuild)
            }

            const deployAction: TerraformDeployConfig = {
              kind: "Deploy",
              type: "terraform",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: [
                ...module.build.dependencies.map(convertBuildDependency),
                ...prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),
              ],

              timeout: defaultTerraformTimeoutSec,
              spec: {
                allowDestroy: module.spec.allowDestroy || true,
                autoApply: module.spec.autoApply || true,
                root: module.spec.root || ".",
                variables: module.spec.variables || {},
                version: module.spec.version || defaultTerraformVersion,
                ...omit(module.spec, ["build", "dependencies"]),
              },
            }

            actions.push(deployAction)

            return {
              group: {
                kind: "Group",
                name: module.name,
                path: module.path,
                actions,
              },
            }
          },
        },
      },
    ],

    tools: Object.values(terraformCliSpecs),
  })
