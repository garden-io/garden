/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema, LocalKubernetesConfig } from "./config.js"
import { createGardenPlugin } from "../../../plugin/plugin.js"
import { dedent } from "../../../util/string.js"
import { DOCS_BASE_URL, STATIC_DIR } from "../../../constants.js"
import {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
} from "../../../plugin/handlers/Provider/prepareEnvironment.js"
import { KubernetesClusterType, KubernetesPluginContext } from "../config.js"
import { prepareEnvironment as _prepareEnvironmentBase } from "../init.js"
import { Log } from "../../../logger/log-entry.js"
import { exec, isTruthy } from "../../../util/util.js"
import chalk from "chalk"
import { setMinikubeDockerEnv } from "./minikube.js"
import { isKindCluster } from "./kind.js"
import { configureMicrok8sAddons } from "./microk8s.js"
import { K8sClientServerVersions, getK8sClientServerVersions } from "../util.js"
import { applyYamlFromFile, apply } from "../kubectl.js"
import { join } from "path"
import { KubeApi } from "../api.js"
import { loadAll } from "js-yaml"
import { readFile } from "fs-extra"
import { getK3sNginxHelmValues, isK3sFamilyCluster } from "./k3s.js"
import { KubernetesResource } from "../types.js"
import { ChildProcessError } from "../../../exceptions.js"
import { helmNginxInstall } from "../integrations/nginx.js"

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
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const config = provider.config

  const clusterType = await getClusterType(k8sCtx, log)

  const setupIngressController = config.setupIngressController

  if (clusterType !== "generic") {
    // We'll override the nginx setup here
    config.setupIngressController = null
  }

  const result = await _prepareEnvironmentBase(params)

  config.setupIngressController = setupIngressController

  const microk8sAddons = ["dns", "registry", "storage"]

  if (setupIngressController === "nginx") {
    if (clusterType === "kind") {
      log.debug("Using nginx-kind service for ingress")
      let versions: K8sClientServerVersions | undefined
      try {
        versions = await getK8sClientServerVersions(config.context)
      } catch (err) {
        log.debug("Failed to get Kubernetes version with error: " + err)
      }
      // TODO: remove this once we no longer support k8s v1.20
      let yamlPath = join(STATIC_DIR, "kubernetes", "nginx-kind-old.yaml")

      if (versions && versions.serverVersion.minor >= 21) {
        yamlPath = join(STATIC_DIR, "kubernetes", "nginx-kind-new.yaml")
      }

      // Note: This basic string replace is fine for now, no other templating is done in these files
      const yamlData = (await readFile(yamlPath))
        .toString()
        .replaceAll("${var.namespace}", config.gardenSystemNamespace)
      const manifests = loadAll(yamlData)
        .filter(isTruthy)
        .map((m) => m as KubernetesResource)

      const api = await KubeApi.factory(log, ctx, provider)
      await apply({ log, ctx, api, provider, manifests, validate: false })
    } else if (clusterType === "k3s") {
      log.debug("Using k3s conformant nginx ingress controller")

      await helmNginxInstall(k8sCtx, log, getK3sNginxHelmValues)
    } else if (clusterType === "minikube") {
      log.debug("Using minikube's ingress addon")
      try {
        await exec("minikube", ["addons", "enable", "ingress"])
      } catch (err) {
        if (!(err instanceof ChildProcessError)) {
          throw err
        }
        log.warn(chalk.yellow(`Unable to enable minikube ingress addon: ${err.details.output}`))
      }
    } else if (clusterType === "microk8s") {
      log.debug("Using microk8s's ingress addon")
      microk8sAddons.push("ingress")
      await applyYamlFromFile(k8sCtx, log, join(STATIC_DIR, "kubernetes", "nginx-ingress-class.yaml"))
    } else {
      clusterType satisfies "generic"
    }
  }

  if (clusterType === "minikube") {
    await setMinikubeDockerEnv()
  } else if (clusterType === "microk8s") {
    await configureMicrok8sAddons(log, microk8sAddons)
  }

  return result
}

async function getClusterType(ctx: KubernetesPluginContext, log: Log): Promise<KubernetesClusterType> {
  const provider = ctx.provider
  const config = provider.config

  if (config.clusterType) {
    return config.clusterType
  }

  if (await isKindCluster(ctx, provider, log)) {
    config.clusterType = "kind"
  } else if (await isK3sFamilyCluster(ctx, provider, log)) {
    config.clusterType = "k3s"
  } else if (config.context === "minikube") {
    config.clusterType = "minikube"
  } else if (config.context === "microk8s") {
    config.clusterType = "microk8s"
  } else {
    config.clusterType = "generic"
  }

  return config.clusterType
}
