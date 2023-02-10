/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../plugin/plugin"
import { dedent } from "../../../util/string"
import { DOCS_BASE_URL } from "../../../constants"

const providerUrl = "./kubernetes.md"

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "local-kubernetes",
    base: "kubernetes",
    docs: dedent`
    The \`local-kubernetes\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that automates and simplifies working with local Kubernetes clusters.

    For general Kubernetes usage information, please refer to the [Kubernetes plugin section](${DOCS_BASE_URL}/kubernetes-plugins/about) in the docs. For local clusters a good place to start is the [Local Kubernetes guide](${DOCS_BASE_URL}/kubernetes-plugins/local-k8s) guide.

    If you're working with a remote Kubernetes cluster, please refer to the [\`kubernetes\` provider](${providerUrl}) docs, and the [Remote Kubernetes guide](${DOCS_BASE_URL}/kubernetes-plugins/remote-k8s) guide.
  `,
    configSchema: configSchema(),
    handlers: {
      configureProvider,
    },
  })

// TODO-G2: pull image before deploying on local k8s
// if (await containerHelpers.imageExistsLocally(module, log, ctx)) {
//   return { fresh: false }
// }
// log.setState(`Pulling image ${image}...`)
// const identifier = helpers.getPublicImageId(module)
// await helpers.dockerCli({ cwd: module.buildPath, args: ["pull", identifier], log, ctx })
// return { fetched: true }
