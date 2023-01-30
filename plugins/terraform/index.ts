/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists } from "fs-extra"
import { createGardenPlugin } from "@garden-io/sdk"
import { cleanupEnvironment, getEnvironmentStatus, prepareEnvironment } from "./init"
import { dedent } from "@garden-io/sdk/util/string"
import { defaultTerraformVersion, supportedVersions, terraformCliSpecs } from "./cli"
import { ConfigurationError } from "@garden-io/sdk/exceptions"
import { TerraformBaseSpec, variablesSchema } from "./common"
import { configureTerraformModule, TerraformModule, terraformModuleSchema } from "./module"
import { docsBaseUrl } from "@garden-io/sdk/constants"
import { listDirectory } from "@garden-io/sdk/util/fs"
import { getTerraformCommands } from "./commands"
import {
  deleteTerraformModule,
  deployTerraform,
  getTerraformStatus,
  TerraformDeployConfig,
  terraformDeployOutputsSchema,
} from "./action"

import { GenericProviderConfig, Provider, providerConfigBaseSchema } from "@garden-io/core/build/src/config/provider"
import { joi } from "@garden-io/core/build/src/config/common"
import { DOCS_BASE_URL } from "@garden-io/core/build/src/constants"
import { ExecBuildConfig } from "@garden-io/core/build/src/plugins/exec/config"
import { ConvertModuleParams } from "@garden-io/core/build/src/plugin/handlers/Module/convert"

type TerraformProviderConfig = GenericProviderConfig &
  TerraformBaseSpec & {
    initRoot?: string
  }

export interface TerraformProvider extends Provider<TerraformProviderConfig> {}

const configSchema = providerConfigBaseSchema()
  .keys({
    allowDestroy: joi.boolean().default(false).description(dedent`
        If set to true, Garden will run \`terraform destroy\` on the project root stack when calling \`garden delete env\`.
      `),
    autoApply: joi.boolean().default(false).description(dedent`
        If set to true, Garden will automatically run \`terraform apply -auto-approve\` when a stack is not up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.

        **Note: This is not recommended for production, or shared environments in general!**
      `),
    initRoot: joi.posixPath().subPathOnly().description(dedent`
        Specify the path to a Terraform config directory, that should be resolved when initializing the provider. This is useful when other providers need to be able to reference the outputs from the stack.

        See the [Terraform guide](${docsBaseUrl}/advanced/terraform) for more information.
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
      .allow(...supportedVersions, null)
      .only()
      .default(defaultTerraformVersion).description(dedent`
        The version of Terraform to use. Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
      `),
    workspace: joi.string().description("Use the specified Terraform workspace."),
  })
  .unknown(false)

// Need to make these variables to avoid escaping issues
const deployOutputsTemplateString = "${deploys.<deploy-name>.outputs.<key>}"
const serviceOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const providerOutputsTemplateString = "${providers.terraform.outputs.<key>}"

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "terraform",
    docs: dedent`
    This provider allows you to integrate Terraform stacks into your Garden project. See the [Terraform guide](${docsBaseUrl}/advanced/terraform) for details and usage information.
  `,
    configSchema,
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
            throw new ConfigurationError(
              `Terraform: configured initRoot config directory '${config.initRoot}' does not exist`,
              { config, projectRoot }
            )
          }
        }

        return { config }
      },
    },
    commands: getTerraformCommands(),

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
          schema: terraformModuleSchema(),
          runtimeOutputsSchema: terraformDeployOutputsSchema(),
          handlers: {
            configure: async ({ ctx, config }) => {
              const provider = ctx.provider as TerraformProvider

              // Use the provider config if no value is specified for the module
              if (config.spec.autoApply === null) {
                config.spec.autoApply = provider.config.autoApply
              }
              if (!config.spec.version) {
                config.spec.version = provider.config.version
              }

              return { config }
            },

            validate: async ({ action }) => {
              const root = action.getSpec("root")
              if (root) {
                const absRoot = join(action.basePath(), root)
                const exists = await pathExists(absRoot)

                if (!exists) {
                  throw new ConfigurationError(`Terraform: configured root directory '${root}' does not exist`, {
                    root,
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
          async convert(params: ConvertModuleParams<TerraformModule>) {
            const { module, dummyBuild, prepareRuntimeDependencies } = params
            const actions: (ExecBuildConfig | TerraformDeployConfig)[] = []

            if (dummyBuild) {
              actions.push(dummyBuild)
            }

            actions.push({
              kind: "Deploy",
              type: "terraform",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),

              spec: {
                ...module.spec,
              },
            })

            return {
              group: {
                kind: "Group",
                name: module.name,
                path: module.path,
                actions,
              },
            }
          },

          async suggestModules({ name, path }) {
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
        },
      },
    ],

    tools: Object.values(terraformCliSpecs),
  })
