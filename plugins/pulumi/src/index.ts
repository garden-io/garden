/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/build/src/util/string.js"
import { deletePulumiDeploy, deployPulumi, getPulumiDeployStatus } from "./handlers.js"
import { getPulumiCommands } from "./commands.js"
import { pulumiCliSpecs } from "./cli.js"
import type { PulumiDeployConfig } from "./action.js"
import { pulumiDeployOutputsSchema, pulumiDeploySchema } from "./action.js"
import { pulumiProviderConfigSchema } from "./provider.js"
import type { ExecBuildConfig } from "@garden-io/core/build/src/plugins/exec/build.js"
import { join } from "path"
import fsExtra from "fs-extra"
const { pathExists } = fsExtra
import { ConfigurationError } from "@garden-io/sdk/build/src/exceptions.js"
import { omit } from "lodash-es"
import type { ConvertModuleParams } from "@garden-io/core/build/src/plugin/handlers/Module/convert.js"
import type { PulumiModule } from "./module.js"
import { configurePulumiModule, pulumiModuleSchema } from "./module.js"

// Need to make these variables to avoid escaping issues
const moduleOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const actionOutputsTemplateString = "${actions.<action-kind>.<action-name>.outputs.<key>}"

const defaultPulumiTimeoutSec = 600

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "pulumi",
    docs: dedent`
      **EXPERIMENTAL**

      This provider allows you to integrate [Pulumi](https://pulumi.com) stacks into your Garden project, via [\`pulumi\` Deploy actions](../action-types/Deploy/pulumi.md).
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
          schema: pulumiDeploySchema(),
          runtimeOutputsSchema: pulumiDeployOutputsSchema(),
          handlers: {
            validate: async ({ action }) => {
              const root = action.getSpec("root")
              if (root) {
                const absRoot = join(action.sourcePath(), root)
                const exists = await pathExists(absRoot)

                if (!exists) {
                  throw new ConfigurationError({
                    message: `Pulumi: configured working directory '${root}' does not exist`,
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
        schema: pulumiModuleSchema(),
        needsBuild: false,
        handlers: {
          configure: configurePulumiModule,

          async convert(params: ConvertModuleParams<PulumiModule>) {
            const { module, dummyBuild, convertBuildDependency, prepareRuntimeDependencies } = params
            const actions: (ExecBuildConfig | PulumiDeployConfig)[] = []

            if (dummyBuild) {
              actions.push(dummyBuild)
            }

            const deployAction: PulumiDeployConfig = {
              kind: "Deploy",
              type: "pulumi",
              name: module.name,
              ...params.baseFields,

              build: dummyBuild?.name,
              dependencies: [
                ...module.build.dependencies.map(convertBuildDependency),
                ...prepareRuntimeDependencies(module.spec.dependencies, dummyBuild),
              ],

              timeout: defaultPulumiTimeoutSec,
              spec: {
                allowDestroy: module.spec.allowDestroy || true,
                autoApply: module.spec.autoApply || true,
                createStack: module.spec.createStack || false,
                pulumiVariables: module.spec.pulumiVariables || {},
                pulumiVarfiles: module.spec.pulumiVarfiles || [],
                cacheStatus: module.spec.cacheStatus || false,
                stackReferences: module.spec.stackReferences || [],
                deployFromPreview: module.spec.deployFromPreview || false,
                useNewPulumiVarfileSchema: module.spec.useNewPulumiVarfileSchema || false,
                showSecretsInOutput: module.spec.showSecretsInOutput || false,
                root: module.spec.root || ".",
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
    tools: Object.values(pulumiCliSpecs),
  })
