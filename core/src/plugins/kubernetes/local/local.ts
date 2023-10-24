/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { LocalKubernetesClusterType } from "./config.js"
import { configureProvider, configSchema, LocalKubernetesConfig } from "./config.js"
import { createGardenPlugin } from "../../../plugin/plugin.js"
import { dedent } from "../../../util/string.js"
import { DOCS_BASE_URL } from "../../../constants.js"
import type {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
} from "../../../plugin/handlers/Provider/prepareEnvironment.js"
import { KubernetesPluginContext } from "../config.js"
import { prepareEnvironment as _prepareEnvironmentBase } from "../init.js"
import { Log } from "../../../logger/log-entry.js"
import { setMinikubeDockerEnv } from "./minikube.js"
import { isKindCluster } from "./kind.js"
import { configureMicrok8sAddons } from "./microk8s.js"
import { isK3sFamilyCluster } from "./k3s.js"

const providerUrl = "./kubernetes.md"

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "local-kubernetes",
    base: "kubernetes",
    docs: dedent`
    The \`local-kubernetes\` provider is a specialized version of the [\`kubernetes\` provider](${providerUrl}) that automates and simplifies working with local Kubernetes clusters.

    For general Kubernetes usage information, please refer to the [Kubernetes guides](${DOCS_BASE_URL}/kubernetes-plugins/about). For local clusters a good place to start is the [Local Kubernetes](${DOCS_BASE_URL}/kubernetes-plugins/local-k8s) guide.

    If you're working with a remote Kubernetes cluster, please refer to the [\`kubernetes\` provider](${providerUrl}) docs, and the [Remote Kubernetes guide](${DOCS_BASE_URL}/kubernetes-plugins/remote-k8s) guide.
  `,
    configSchema: configSchema(),
    handlers: {
      configureProvider,
      prepareEnvironment,
    },
  })

async function prepareEnvironment(
  params: PrepareEnvironmentParams<LocalKubernetesConfig>
): Promise<PrepareEnvironmentResult> {
  const { ctx, log } = params
  const provider = ctx.provider

  let clusterType = provider.config.clusterType
  if (!clusterType) {
    clusterType = await getClusterType(ctx, log)
    provider.config.clusterType = clusterType
  }

  const result = await _prepareEnvironmentBase(params)

  if (clusterType === "minikube") {
    await setMinikubeDockerEnv()
  } else if (clusterType === "microk8s") {
    const microk8sAddons = ["dns", "registry", "storage"]
    await configureMicrok8sAddons(log, microk8sAddons)
  }

  return result
}

async function getClusterType(ctx: KubernetesPluginContext, log: Log): Promise<LocalKubernetesClusterType> {
  const provider = ctx.provider
  const config = provider.config

  if (await isKindCluster(ctx, provider, log)) {
    return "kind"
  } else if (await isK3sFamilyCluster(ctx, provider, log)) {
    return "k3s"
  } else if (config.context === "minikube") {
    return "minikube"
  } else if (config.context === "microk8s") {
    return "microk8s"
  } else {
    return "generic"
  }
}
