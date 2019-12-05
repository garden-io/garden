/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { KubernetesConfig, kubernetesConfigBase, k8sContextSchema } from "../config"
import { ConfigureProviderParams } from "../../../types/plugin/provider/configureProvider"
import { joiProviderName, joi } from "../../../config/common"
import { getKubeConfig } from "../api"
import { configureMicrok8sAddons } from "./microk8s"
import { setMinikubeDockerEnv } from "./minikube"
import { exec } from "../../../util/util"
import { remove } from "lodash"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube

// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "microk8s", "minikube"]
const nginxServices = ["ingress-controller", "default-backend"]

export interface LocalKubernetesConfig extends KubernetesConfig {
  setupIngressController: string | null
}

export const configSchema = kubernetesConfigBase
  .keys({
    name: joiProviderName("local-kubernetes"),
    context: k8sContextSchema.optional(),
    namespace: joi
      .string()
      .default(undefined, "<project name>")
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
  const { base, log, projectName } = params
  let { config } = await base!(params)

  const namespace = config.namespace!
  const _systemServices = config._systemServices

  if (!config.context) {
    // automatically detect supported kubectl context if not explicitly configured
    // create dummy provider with just enough info needed for the getKubeConfig function
    const provider = {
      name: config.name,
      dependencies: [],
      config,
      moduleConfigs: [],
      status: { ready: true, outputs: {} },
    }
    const kubeConfig = await getKubeConfig(log, provider)
    const currentContext = kubeConfig["current-context"]

    if (currentContext && supportedContexts.includes(currentContext)) {
      // prefer current context if set and supported
      config.context = currentContext
      log.debug({ section: config.name, msg: `Using current context: ${config.context}` })
    } else {
      const availableContexts = kubeConfig.contexts.map((c: any) => c.name)

      for (const supportedContext of supportedContexts) {
        if (availableContexts.includes(supportedContext)) {
          config.context = supportedContext
          log.debug({ section: config.name, msg: `Using detected context: ${config.context}` })
          break
        }
      }
    }

    if (!config.context && kubeConfig.contexts.length > 0) {
      config.context = kubeConfig.contexts[0].name
      log.debug({
        section: config.name,
        msg: `No kubectl context auto-detected, using first available: ${config.context}`,
      })
    }
  }

  if (!config.context) {
    config.context = supportedContexts[0]
    log.debug({ section: config.name, msg: `No kubectl context configured, using default: ${config.context}` })
  }

  if (config.context === "minikube") {
    const initCmds = [
      ["config", "set", "WantUpdateNotification", "false"],
      ["addons", "enable", "dashboard"],
    ]
    await Bluebird.map(initCmds, async (cmd) => exec("minikube", cmd))

    if (!config.defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const { stdout } = await exec("minikube", ["ip"])
      config.defaultHostname = `${projectName}.${stdout}.nip.io`
    }

    if (config.setupIngressController === "nginx") {
      log.debug("Using minikube's ingress addon")
      await exec("minikube", ["addons", "enable", "ingress"])
      remove(_systemServices, (s) => nginxServices.includes(s))
    }

    await setMinikubeDockerEnv()
  } else if (config.context === "microk8s") {
    const addons = ["dns", "dashboard", "registry", "storage"]

    if (config.setupIngressController === "nginx") {
      log.debug("Using microk8s's ingress addon")
      addons.push("ingress")
      remove(_systemServices, (s) => nginxServices.includes(s))
    }

    await configureMicrok8sAddons(log, addons)

    // Need to push to the built-in registry
    config.deploymentRegistry = {
      hostname: "localhost:32000",
      namespace,
    }
  } else {
    _systemServices.push("kubernetes-dashboard")
  }

  if (!config.defaultHostname) {
    config.defaultHostname = `${projectName}.local.app.garden`
  }

  return { config }
}
