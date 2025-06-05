/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "@garden-io/sdk/build/src/util/string.js"
import { defaultTerraformVersion, supportedVersions } from "./cli.js"
import type { TerraformBaseSpec } from "./helpers.js"
import { terraformBackendConfigSchema, variablesSchema } from "./helpers.js"
import { docsBaseUrl } from "@garden-io/sdk/build/src/constants.js"

import type { BaseProviderConfig, Provider } from "@garden-io/core/build/src/config/provider.js"
import { providerConfigBaseSchema } from "@garden-io/core/build/src/config/provider.js"
import { joi } from "@garden-io/core/build/src/config/common.js"

export type TerraformProviderConfig = BaseProviderConfig &
  TerraformBaseSpec & {
    initRoot?: string
    streamLogsToCloud: boolean
  }

export type TerraformProvider = Provider<TerraformProviderConfig>

export const terraformProviderConfigSchema = providerConfigBaseSchema()
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
    // When you provide variables directly in \`terraform\` actions, those variables will
    // extend the ones specified here, and take precedence if the keys overlap.
    variables: variablesSchema().description(dedent`
        A map of variables to use when applying Terraform stacks. You can define these here, in individual
        \`terraform\` action configs, or you can place a \`terraform.tfvars\` file in each working directory.
      `),
    // May be overridden by individual \`terraform\` actions.
    version: joi
      .string()
      .allow(...supportedVersions, null)
      .only()
      .default(defaultTerraformVersion).description(dedent`
        The version of Terraform to use. Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
      `),
    workspace: joi.string().description("Use the specified Terraform workspace."),
    streamLogsToCloud: joi
      .boolean()
      .default(false)
      .description(
        `Set to \`true\` to make logs from Terraform Deploy actions visible in Garden Cloud/Enterprise. Defaults to \`false\``
      ),
    backendConfig: terraformBackendConfigSchema(),
  })
  .unknown(false)
