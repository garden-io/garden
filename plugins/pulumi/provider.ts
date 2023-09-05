/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "@worldofgeese/core/build/src/config/common"
import { GenericProviderConfig, Provider, providerConfigBaseSchema } from "@worldofgeese/core/build/src/config/provider"
import { dedent } from "@worldofgeese/sdk/util/string"
import { defaultPulumiVersion, supportedVersions } from "./cli"

export type PulumiProviderConfig = GenericProviderConfig & {
  version: string | null
  previewDir: string | null
  orgName?: string
  backendURL: string
  pluginTaskConcurrencyLimit: number
}

export interface PulumiProvider extends Provider<PulumiProviderConfig> {}

export const pulumiProviderConfigSchema = providerConfigBaseSchema()
  .keys({
    // May be overridden by individual \`pulumi\` modules.
    version: joi
      .string()
      .allow(...supportedVersions, null)
      .only()
      .default(defaultPulumiVersion).description(dedent`
        The version of pulumi to use. Set to \`null\` to use whichever version of \`pulumi\` is on your PATH.
      `),
    previewDir: joi
      .posixPath()
      .subPathOnly()
      .description(
        dedent`
        Overrides the default plan directory path used when deploying with the \`deployFromPreview\` option for pulumi
        deploy actions.

        Must be a relative path to a directory inside the project root.

        This option can be useful when you want to provide a folder of pre-approved pulumi plans to a CI pipeline step.
    `
      ),
    orgName: joi.string().optional().empty(["", null]).description(dedent`
      The name of the pulumi organization to use. This option can also be set on the deploy action level, in which case it
      overrides this provider-level option. Note that setting the organization name is only necessary when using
      pulumi managed backend with an organization.
    `),
    backendURL: joi.string().optional().uri().empty(["", null]).default("https://api.pulumi.com").description(dedent`
      The URL of the state backend endpoint used. This option can also be set on the deploy action level, in which case it
      overrides this  provider-level option. Set this option as per list of available self-managed state backends on
      https://www.pulumi.com/docs/intro/concepts/state/#using-a-self-managed-backend
    `),
    pluginTaskConcurrencyLimit: joi.number().default(5).description(dedent`
      Sets the maximum task concurrency for the tasks generated by the pulumi plugin commands (e.g. when running
      \`garden plugins pulumi preview\`).

      Note: This limit is not applied when running built-in commands (e.g. \`garden deploy\`).
    `),
  })
  .unknown(false)
