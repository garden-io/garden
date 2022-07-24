/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/util/string"
import { configurePulumiModule, deletePulumiDeploy, deployPulumi, getPulumiDeployStatus } from "./handlers"
import { docsBaseUrl } from "@garden-io/sdk/constants"
import { getPulumiCommands } from "./commands"

import { joiVariables } from "@garden-io/core/build/src/config/common"
import { pulumiCliSPecs } from "./cli"
import { PulumiDeployConfig, pulumiDeploySpecSchema, PulumiProvider, pulumiProviderConfigSchema } from "./config"
import { ExecBuildConfig } from "@garden-io/core/build/src/plugins/exec/config"
import { join } from "path"
import { pathExists } from "fs-extra"
import { ConfigurationError } from "@garden-io/sdk/exceptions"

// Need to make these variables to avoid escaping issues
const moduleOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const actionOutputsTemplateString = "${actions.<name>.outputs.<key>}"
// const moduleReferenceUrl = `${docsBaseUrl}/reference/module-types/pulumi`
const deployReferenceUrl = `${docsBaseUrl}/reference/action-types/deploy/pulumi`

const outputsSchema = () => joiVariables().description("A map of all the outputs returned by the Pulumi stack.")

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "pulumi",
    docs: dedent`
      **EXPERIMENTAL**

      This provider allows you to integrate [Pulumi](https://pulumi.com) stacks into your Garden project, via [\`pulumi\` Deploy actions](${deployReferenceUrl}).
    `,
    configSchema: pulumiProviderConfigSchema,

    commands: getPulumiCommands(),

    createActionTypes: {
      Deploy: [
        {
          name: "pulumi",
          docs: dedent`
          Deploys a Pulumi stack and either creates/updates it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

          **Note: It is not recommended to set \`autoApply\` to \`true\` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run \`garden plugins pulumi\` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the action. For others, simply run the Pulumi CLI as usual from the project root.

          Stack outputs are made available as action outputs. These can then be referenced by other actions under \`${actionOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.
          `,
          schema: pulumiDeploySpecSchema(),
          outputsSchema: outputsSchema(),
          handlers: {
            configure: async ({ ctx, config }) => {
              const provider = ctx.provider as PulumiProvider

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
                  throw new ConfigurationError(`Pulumi: configured working directory '${root}' does not exist`, {
                    root,
                  })
                }
              }
              return {}
            },

            deploy: deployPulumi,
            getStatus: getPulumiDeployStatus,
            delete: deletePulumiDeploy,
          },
        },
      ],
    },

    createModuleTypes: [
      {
        name: "pulumi",
        docs: dedent`
        Deploys a Pulumi stack and either creates/updates it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

        **Note: It is not recommended to set \`autoApply\` to \`true\` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run \`garden plugins pulumi\` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the action. For others, simply run the Pulumi CLI as usual from the project root.

        Stack outputs are made available as service outputs. These can then be referenced by other actions under \`${moduleOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.
        `,
        schema: pulumiDeploySpecSchema(),
        needsBuild: false,
        handlers: {
          configure: configurePulumiModule,

          async convert(params) {
            const { module, dummyBuild, prepareRuntimeDependencies } = params
            const actions: (ExecBuildConfig | PulumiDeployConfig)[] = []

            if (dummyBuild) {
              actions.push(dummyBuild)
            }

            actions.push({
              kind: "Deploy",
              type: "pulumi",
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
                actions,
              },
            }
          },
        },
      },
    ],
    tools: Object.values(pulumiCliSPecs),
  })
