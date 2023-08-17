/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../plugin/plugin"
import { dedent } from "../../../util/string"

const providerUrl = "./kubernetes.md"
export const EPHEMERAL_KUBERNETES_PROVIDER_NAME = "ephemeral-kubernetes"

export const gardenPlugin = () =>
  createGardenPlugin({
    name: EPHEMERAL_KUBERNETES_PROVIDER_NAME,
    base: "kubernetes",
    docs: dedent`
    The \`${EPHEMERAL_KUBERNETES_PROVIDER_NAME}\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that ....
  `,
    configSchema: configSchema(),
    handlers: {
      configureProvider,
    },
  })
