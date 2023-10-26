/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/build/src/util/string"
import { deletePulumiDeploy, deployPulumi, getPulumiDeployStatus } from "./handlers"
import { getPulumiCommands } from "./commands"
import { pulumiCliSPecs } from "./cli"
import { PulumiDeployConfig, pulumiDeployOutputsSchema, pulumiDeploySchema } from "./action"
import { pulumiProviderConfigSchema } from "./provider"
import { ExecBuildConfig } from "@garden-io/core/build/src/plugins/exec/build"
import { join } from "path"
import { pathExists } from "fs-extra"
import { ConfigurationError } from "@garden-io/sdk/build/src/exceptions"
import { omit } from "lodash"
import { ConvertModuleParams } from "@garden-io/core/build/src/plugin/handlers/Module/convert"
import { configurePulumiModule, PulumiModule, pulumiModuleSchema } from "./module"

// Need to make these variables to avoid escaping issues
const moduleOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const actionOutputsTemplateString = "${actions.<name>.outputs.<key>}"

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
    tools: Object.values(pulumiCliSPecs),
  })
