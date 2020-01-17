/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../types/plugin/plugin"
import { dedent } from "../../../util/string"

export const gardenPlugin = createGardenPlugin({
  name: "local-kubernetes",
  base: "kubernetes",
  docs: dedent`
    The \`local-kubernetes\` provider is a specialized version of the [\`kubernetes\` provider](./kubernetes.md) that
    automates and simplifies working with local Kubernetes clusters.

    For general Kubernetes usage information, please refer to the [guides section](../guides/README.md). For local
    clusters a good place to start is the [Local Kubernetes guide](../guides/local-kubernetes.md) guide.
    The [demo-project](../examples/demo-project.md) example project and guide are also helpful as an introduction.

    If you're working with a remote Kubernetes cluster, please refer to the [\`kubernetes\` provider](./kubernetes.md)
    docs, and the [Remote Kubernetes guide](../guides/remote-kubernetes.md) guide.
  `,
  configSchema,
  handlers: {
    configureProvider,
  },
})
