/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesConfig, KubernetesProvider } from "../config.js"
import { kubernetesConfigBase, k8sContextSchema, namespaceSchema } from "../config.js"
import type { ConfigureProviderParams } from "../../../plugin/handlers/Provider/configureProvider.js"
import { joiProviderName, joi } from "../../../config/common.js"
import { getKubeConfig } from "../api.js"
import { exec } from "../../../util/util.js"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube
// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = [
  "docker-desktop",
  "docker-for-desktop",
  "microk8s",
  "minikube",
  "kind-kind",
  "colima",
  "rancher-desktop",
  "k3d-k3s-default",
  "orbstack",
]

export type LocalKubernetesClusterType = "kind" | "minikube" | "microk8s" | "k3s" | "generic"

function isSupportedContext(context: string) {
  return supportedContexts.includes(context) || context.startsWith("kind-")
}

export type LocalKubernetesConfig = KubernetesConfig

export const configSchema = () =>
  kubernetesConfigBase()
    .keys({
      name: joiProviderName("local-kubernetes"),
      context: k8sContextSchema().optional().empty(["", null]),
      namespace: namespaceSchema().description(
        "Specify which namespace to deploy services to (defaults to the project name). " +
          "Note that the framework generates other namespaces as well with this name as a prefix."
      ),
      setupIngressController: joi
        .string()
        .allow("nginx", false, null)
        .default("nginx")
        .description("Set this to null or false to skip installing/enabling the `nginx` ingress controller."),
    })
    .description("The provider configuration for the local-kubernetes plugin.")

export async function configureProvider(params: ConfigureProviderParams<LocalKubernetesConfig>) {
  const { base, log, projectName, ctx } = params

  const { config } = await base!(params)

  const provider = ctx.provider as KubernetesProvider
  provider.config = config

  const kubeConfig: any = await getKubeConfig(log, ctx, provider)

  const currentContext = kubeConfig["current-context"]!

  if (!config.context) {
    // automatically detect supported kubectl context if not explicitly configured
    if (currentContext && isSupportedContext(currentContext)) {
      // prefer current context if set and supported
      config.context = currentContext
      log.info(`Using current context: ${config.context}`)
    } else {
      const availableContexts = kubeConfig.contexts?.map((c: any) => c.name) || []

      for (const context of availableContexts) {
        if (isSupportedContext(context)) {
          config.context = context
          log.info(`Using detected context: ${config.context}`)
          break
        }
      }
    }

    if (!config.context && kubeConfig.contexts?.length > 0) {
      config.context = kubeConfig.contexts[0]!.name
      log.info(`No kubectl context auto-detected, using first available: ${config.context}`)
    }
  }

  // TODO: change this in 0.13 to use the current context
  if (!config.context) {
    config.context = supportedContexts[0]
    log.info(`No kubectl context configured, using default: ${config.context}`)
  }

  if (config.context === "minikube") {
    await exec("minikube", ["config", "set", "WantUpdateNotification", "false"])

    config.clusterType = "minikube"

    if (!config.defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const { stdout } = await exec("minikube", ["ip"])
      config.defaultHostname = `${projectName}.${stdout}.nip.io`
    }
  }

  if (!config.defaultHostname) {
    config.defaultHostname = `${projectName}.local.demo.garden`
  }

  return { config }
}
