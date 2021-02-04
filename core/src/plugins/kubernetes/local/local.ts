/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../types/plugin/plugin"
import { dedent } from "../../../util/string"
import { DOCS_BASE_URL } from "../../../constants"
import { getProviderUrl } from "../../../docs/common"

const providerUrl = getProviderUrl("kubernetes")

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "local-kubernetes",
    base: "kubernetes",
    docs: dedent`
    The \`local-kubernetes\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that automates and simplifies working with local Kubernetes clusters.

    For general Kubernetes usage information, please refer to the [guides section](${DOCS_BASE_URL}/guides). For local clusters a good place to start is the [Local Kubernetes guide](${DOCS_BASE_URL}/guides/local-kubernetes) guide. The [demo-project](${DOCS_BASE_URL}/example-projects/getting-started/2-initialize-a-project) example project and guide are also helpful as an introduction.

    If you're working with a remote Kubernetes cluster, please refer to the [\`kubernetes\` provider](${providerUrl}) docs, and the [Remote Kubernetes guide](${DOCS_BASE_URL}/guides/remote-kubernetes) guide.
  `,
    configSchema: configSchema(),
    handlers: {
      configureProvider,
    },
  })
