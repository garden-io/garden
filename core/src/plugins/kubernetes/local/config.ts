/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubernetesConfig, kubernetesConfigBase, k8sContextSchema, KubernetesProvider } from "../config"
import { ConfigureProviderParams } from "../../../types/plugin/provider/configureProvider"
import { joiProviderName, joi } from "../../../config/common"
import { getKubeConfig } from "../api"
import { configureMicrok8sAddons } from "./microk8s"
import { setMinikubeDockerEnv } from "./minikube"
import { exec } from "../../../util/util"
import { remove } from "lodash"
import { getNfsStorageClass } from "../init"
import chalk from "chalk"
import { isKindCluster } from "./kind"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube
// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "docker-desktop", "microk8s", "minikube", "kind-kind"]
const nginxServices = ["ingress-controller", "default-backend"]

function isSupportedContext(context: string) {
  return supportedContexts.includes(context) || context.startsWith("kind-")
}

export interface LocalKubernetesConfig extends KubernetesConfig {
  setupIngressController: string | null
}

export const configSchema = () =>
  kubernetesConfigBase()
    .keys({
      name: joiProviderName("local-kubernetes"),
      context: k8sContextSchema().optional(),
      namespace: joi
        .string()
        .description(
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

  let { config } = await base!(params)

  const provider = ctx.provider as KubernetesProvider
  provider.config = config
  const _systemServices = config._systemServices

  const kubeConfig: any = await getKubeConfig(log, ctx, provider)

  const currentContext = kubeConfig["current-context"]!

  if (!config.context) {
    // automatically detect supported kubectl context if not explicitly configured
    if (currentContext && isSupportedContext(currentContext)) {
      // prefer current context if set and supported
      config.context = currentContext
      log.debug({ section: config.name, msg: `Using current context: ${config.context}` })
    } else {
      const availableContexts = kubeConfig.contexts?.map((c: any) => c.name) || []

      for (const context of availableContexts) {
        if (isSupportedContext(context)) {
          config.context = context
          log.debug({ section: config.name, msg: `Using detected context: ${config.context}` })
          break
        }
      }
    }

    if (!config.context && kubeConfig.contexts?.length > 0) {
      config.context = kubeConfig.contexts[0]!.name
      log.debug({
        section: config.name,
        msg: `No kubectl context auto-detected, using first available: ${config.context}`,
      })
    }
  }

  // TODO: change this in 0.12 to use the current context
  if (!config.context) {
    config.context = supportedContexts[0]
    log.debug({ section: config.name, msg: `No kubectl context configured, using default: ${config.context}` })
  }

  if (await isKindCluster(ctx, provider, log)) {
    config.clusterType = "kind"

    if (config.setupIngressController === "nginx") {
      log.debug("Using nginx-kind service for ingress")
      remove(_systemServices, (s) => nginxServices.includes(s))
      _systemServices.push("nginx-kind")
    }
  } else if (config.context === "minikube") {
    await exec("minikube", ["config", "set", "WantUpdateNotification", "false"])

    config.clusterType = "minikube"

    if (!config.defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const { stdout } = await exec("minikube", ["ip"])
      config.defaultHostname = `${projectName}.${stdout}.nip.io`
    }

    if (config.setupIngressController === "nginx") {
      log.debug("Using minikube's ingress addon")
      try {
        await exec("minikube", ["addons", "enable", "ingress"])
      } catch (err) {
        log.warn(chalk.yellow(`Unable to enable minikube ingress addon: ${err.all}`))
      }
      remove(_systemServices, (s) => nginxServices.includes(s))
    }

    await setMinikubeDockerEnv()
  } else if (config.context === "microk8s") {
    const addons = ["dns", "registry", "storage"]

    config.clusterType = "microk8s"

    if (config.setupIngressController === "nginx") {
      log.debug("Using microk8s's ingress addon")
      addons.push("ingress")
      remove(_systemServices, (s) => nginxServices.includes(s))
    }

    await configureMicrok8sAddons(log, addons)
  }

  // Docker Desktop, minikube and others are unable to run docker-in-docker overlayfs
  // on top of their default storage class, so we override the default here to use the NFS storage class.
  if (config.buildMode !== "local-docker" && !config.storage.builder.storageClass) {
    config.storage.builder.storageClass = getNfsStorageClass(config)
  }

  if (!config.defaultHostname) {
    config.defaultHostname = `${projectName}.local.app.garden`
  }

  return { config }
}
