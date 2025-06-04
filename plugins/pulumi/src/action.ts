/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeepPrimitiveMap } from "@garden-io/core/build/src/config/common.js"
import { createSchema, joi, joiSparseArray, joiVariables } from "@garden-io/core/build/src/config/common.js"
import type { DeployAction, DeployActionConfig } from "@garden-io/core/build/src/actions/deploy.js"
import { dedent } from "@garden-io/sdk/build/src/util/string.js"

export interface PulumiDeploySpec {
  allowDestroy: boolean
  autoApply: boolean
  createStack: boolean
  pulumiVariables: DeepPrimitiveMap
  pulumiVarfiles: string[]
  orgName?: string
  cacheStatus: boolean
  stackReferences: string[]
  deployFromPreview: boolean
  root: string
  useNewPulumiVarfileSchema: boolean
  stack?: string
  showSecretsInOutput: boolean
}

export type PulumiDeployConfig = DeployActionConfig<"pulumi", PulumiDeploySpec>
export type PulumiDeploy = DeployAction<PulumiDeployConfig>

// Validate that the path ends in .yaml or .yml
const yamlFileRegex = /(\.yaml)|(\.yml)$/

export const pulumiDeploySchemaKeys = () => ({
  allowDestroy: joi.boolean().default(true).description(dedent`
    If set to true, Garden will destroy the stack when calling \`garden cleanup namespace\` or \`garden cleanup deploy <deploy action name>\`.
    This is useful to prevent unintentional destroys in production or shared environments.
    `),
  autoApply: joi.boolean().default(true).description(dedent`
    If set to false, deployments will fail unless a \`planPath\` is provided for this deploy action. This is useful when deploying to
    production or shared environments, or when the action deploys infrastructure that you don't want to unintentionally update/create.
    `),
  createStack: joi.boolean().default(false).description(dedent`
    If set to true, Garden will automatically create the stack if it doesn't already exist.
    `),
  root: joi.posixPath().subPathOnly().default(".").description(dedent`
    Specify the path to the Pulumi project root, relative to the deploy action's root.
    `),
  useNewPulumiVarfileSchema: joi.boolean().default(false).description(dedent`
    If set to true, the deploy action will use the new Pulumi varfile schema, which does not nest all variables under
    the 'config' key automatically like the old schema. This allow setting variables at the root level of the varfile
    that don't belong to the 'config' key. Example:
    \`\`\`
    config:
      myVar: value
    secretsprovider: gcpkms://projects/xyz/locations/global/keyRings/pulumi/cryptoKeys/pulumi-secrets
    \`\`\`
    For more information see [this guide on pulumi varfiles and variables](https://docs.garden.io/pulumi-plugin/about#pulumi-varfile-schema)
    `),
  pulumiVariables: joiVariables().default({}).description(dedent`
    A map of config variables to use when applying the stack. These are merged with the contents of any \`pulumiVarfiles\` provided
    for this deploy action. The deploy action's stack config will be overwritten with the resulting merged config.
    Variables declared here override any conflicting config variables defined in this deploy action's \`pulumiVarfiles\`.

    Note: \`pulumiVariables\` should not include action outputs from other pulumi deploy actions when \`cacheStatus\` is set to true, since
    the outputs may change from the time the stack status of the dependency action is initially queried to when it's been deployed.

    Instead, use pulumi stack references when using the \`cacheStatus\` config option.
    `),
  pulumiVarfiles: joiSparseArray(joi.posixPath().pattern(yamlFileRegex)).description(
    dedent`
      Specify one or more paths (relative to the deploy action's root) to YAML files containing pulumi configuration.

      Templated paths that resolve to \`null\`, \`undefined\` or an empty string are ignored.

      Any Garden template strings in these varfiles will be resolved when the files are loaded.

      Each file must consist of a single YAML document, which must be a map (dictionary). Keys may contain any
      value type.

      If one or more varfiles is not found, no error is thrown (that varfile path is simply ignored).

      Note: The old varfile schema nests all variables under the 'config' key automatically. If you need to set variables
      at the root level of the varfile that don't belong to the 'config' key, set \`useNewPulumiVarfileSchema\` to true.
        `
  ),
  orgName: joi.string().optional().empty(["", null]).description(dedent`
    The name of the pulumi organization to use. Overrides the \`orgName\` set on the pulumi provider (if any).
    To use the default org, set to null.
    `),
  cacheStatus: joi
    .boolean()
    .default(false)
    .description(
      dedent`
        When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
        will then be used for service status checks for this service. If the version doesn't change between deploys,
        the subsequent deploy is skipped.

        Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
        unless they're referenced via template strings in the deploy action configuration.

        When using stack references to other pulumi deploy actions in your project, we recommend including them in this
        deploy action's \`stackReferences\` config field (see the documentation for that field on this page).

        \`cacheStatus: true\` is not supported for self-managed state backends.
    `
    ),
  stackReferences: joiSparseArray(joi.string())
    .description(
      dedent`
        When setting \`cacheStatus\` to true for this deploy action, you should include all stack references used by this
        deploy action's pulumi stack in this field.

        This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
        have changed since the last deployment.
      `
    )
    .example([
      "${actions.deploy.some-pulumi-deploy-action.outputs.ip-address}",
      "${actions.deploy.some-other-pulumi-deploy-action.outputs.database-url}",
    ]),
  deployFromPreview: joi
    .boolean()
    .default(false)
    .description(
      dedent`
        When set to true, will use pulumi plans generated by the \`garden plugins pulumi preview\` command when
        deploying, and will fail if no plan exists locally for the deploy action.

        When this option is used, the pulumi plugin bypasses the status check altogether and passes the plan directly
        to \`pulumi up\` (via the \`--plan\` option, which is experimental as of March 2022). You should therefore
        take care to only use this config option when you're sure you want to apply the changes in the plan.

        This option is intended for two-phase pulumi deployments, where pulumi preview diffs are first reviewed (e.g.
        during code review).
      `
    ),
  stack: joi
    .string()
    .allow(null)
    .description("The name of the pulumi stack to use. Defaults to the current environment name."),
  showSecretsInOutput: joi
    .boolean()
    .default(false)
    .description(
      dedent`
      When set to true, stack outputs which are marked as secrets will be shown in the output.

      By default, Pulumi will print secret stack outputs as the string '[secret]' instead of
      the true content of the output.
      `
    ),
})

export const pulumiDeploySchema = createSchema({
  name: "pulumi:Deploy",
  keys: pulumiDeploySchemaKeys,
})

export const pulumiDeployOutputsSchema = () =>
  joiVariables().description("A map of all the outputs returned by the Pulumi stack.")
