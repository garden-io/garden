/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createSchema, joi, joiVariables } from "@garden-io/core/build/src/config/common.js"
import { dedent } from "@garden-io/core/build/src/util/string.js"
import { supportedVersions } from "./cli.js"
import type { TerraformBaseSpec } from "./helpers.js"
import { terraformBackendConfigSchema, variablesSchema } from "./helpers.js"
import type { DeployAction, DeployActionConfig } from "@garden-io/core/build/src/actions/deploy.js"

export interface TerraformDeploySpec extends TerraformBaseSpec {
  root: string
}

export type TerraformDeployConfig = DeployActionConfig<"terraform", TerraformDeploySpec>
export type TerraformDeploy = DeployAction<TerraformDeployConfig, Record<string, unknown>>

export const terraformDeploySchemaKeys = () => ({
  allowDestroy: joi.boolean().default(false).description(dedent`
    If set to true, Garden will run \`terraform destroy\` on the stack when calling \`garden delete namespace\` or \`garden delete deploy <deploy name>\`.
  `),
  autoApply: joi.boolean().allow(null).default(null).description(dedent`
    If set to true, Garden will automatically run \`terraform apply -auto-approve\` when the stack is not
    up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing
    entirely.

    **NOTE: This is not recommended for production, or shared environments in general!**

    Defaults to the value set in the provider config.
  `),
  root: joi.posixPath().subPathOnly().default(".").description(dedent`
    Specify the path to the working directory root—i.e. where your Terraform files are—relative to the config directory.
  `),
  variables: variablesSchema().description(dedent`
    A map of variables to use when applying the stack. You can define these here or you can place a
    \`terraform.tfvars\` file in the working directory root.

    If you specified \`variables\` in the \`terraform\` provider config, those will be included but the variables
    specified here take precedence.
  `),
  version: joi.string().allow(...supportedVersions, null).description(dedent`
    The version of Terraform to use. Defaults to the version set in the provider config.
    Set to \`null\` to use whichever version of \`terraform\` that is on your PATH.
  `),
  workspace: joi.string().allow(null).description("Use the specified Terraform workspace."),
  backendConfig: terraformBackendConfigSchema(),
})

export const terraformDeploySchema = createSchema({
  name: "terraform:Deploy",
  keys: terraformDeploySchemaKeys,
})

export const terraformDeployOutputsSchema = () =>
  joiVariables().description("A map of all the outputs defined in the Terraform stack.")
