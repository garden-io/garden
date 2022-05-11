/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/util/string"
import { configurePulumiModule, deletePulumiService, deployPulumiService, getPulumiServiceStatus } from "./handlers"
import { docsBaseUrl } from "@garden-io/sdk/constants"
import { getPulumiCommands } from "./commands"

import { joiVariables } from "@garden-io/core/build/src/config/common"
import { pulumiCliSPecs } from "./cli"
import { pulumiModuleSchema, pulumiProviderConfigSchema } from "./config"

// Need to make these variables to avoid escaping issues
const serviceOutputsTemplateString = "${runtime.services.<module-name>.outputs.<key>}"
const moduleReferenceUrl = `${docsBaseUrl}/reference/module-types/pulumi`

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "pulumi",
    docs: dedent`
      **EXPERIMENTAL**

      This provider allows you to integrate [Pulumi](https://pulumi.com) stacks into your Garden project, via [\`pulumi\` modules](${moduleReferenceUrl}).
    `,
    configSchema: pulumiProviderConfigSchema,
    commands: getPulumiCommands(),
    createModuleTypes: [
      {
        name: "pulumi",
        docs: dedent`
          Deploys a Pulumi stack and either creates/updates it automatically (if \`autoApply: true\`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

          **Note: It is not recommended to set \`autoApply\` to \`true\` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run \`garden plugins pulumi\` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the module. For others, simply run the Pulumi CLI as usual from the project root.

          Stack outputs are made available as service outputs. These can then be referenced by other modules under \`${serviceOutputsTemplateString}\`. You can template in those values as e.g. command arguments or environment variables for other services.
        `,
        serviceOutputsSchema: joiVariables().description("A map of all the outputs returned by the Pulumi stack."),
        schema: pulumiModuleSchema(),
        handlers: {
          configure: configurePulumiModule,
          getServiceStatus: getPulumiServiceStatus,
          deployService: deployPulumiService,
          deleteService: deletePulumiService,
        },
      },
    ],
    tools: Object.values(pulumiCliSPecs),
  })
