/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as execa from "execa"
import * as Joi from "joi"
import { KubernetesBaseConfig, kubernetesConfigBase, k8sContextSchema } from "../kubernetes"
import { ConfigureProviderParams } from "../../../types/plugin/params"
import { joiProviderName } from "../../../config/common"
import { getKubeConfig } from "../api"
import { configureMicrok8sAddons } from "./microk8s"
import { setMinikubeDockerEnv } from "./minikube"
import { ContainerRegistryConfig } from "../../container/config"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube

// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "microk8s", "minikube"]

export interface LocalKubernetesConfig extends KubernetesBaseConfig {
  _system?: Symbol
  setupIngressController: string | null
}

export const configSchema = kubernetesConfigBase
  .keys({
    name: joiProviderName("local-kubernetes"),
    context: k8sContextSchema
      .optional(),
    namespace: Joi.string()
      .default(undefined, "<project name>")
      .description(
        "Specify which namespace to deploy services to (defaults to the project name). " +
        "Note that the framework generates other namespaces as well with this name as a prefix.",
      ),
    setupIngressController: Joi.string()
      .allow("nginx", false, null)
      .default("nginx")
      .description("Set this to null or false to skip installing/enabling the `nginx` ingress controller."),
    _system: Joi.any().meta({ internal: true }),
  })
  .description("The provider configuration for the local-kubernetes plugin.")

export async function configureProvider({ config, log, projectName }: ConfigureProviderParams<LocalKubernetesConfig>) {
  let context = config.context
  let defaultHostname = config.defaultHostname
  let deploymentRegistry: ContainerRegistryConfig | undefined = undefined

  const namespace = config.namespace || projectName
  const _systemServices: string[] = ["kubernetes-dashboard"]

  if (!context) {
    // automatically detect supported kubectl context if not explicitly configured
    const kubeConfig = await getKubeConfig(log)
    const currentContext = kubeConfig["current-context"]

    if (currentContext && supportedContexts.includes(currentContext)) {
      // prefer current context if set and supported
      context = currentContext
      log.debug({ section: config.name, msg: `Using current context: ${context}` })
    } else {
      const availableContexts = kubeConfig.contexts.map(c => c.name)

      for (const supportedContext of supportedContexts) {
        if (availableContexts.includes(supportedContext)) {
          context = supportedContext
          log.debug({ section: config.name, msg: `Using detected context: ${context}` })
          break
        }
      }
    }

    if (!context && kubeConfig.contexts.length > 0) {
      context = kubeConfig.contexts[0].name
      log.debug({ section: config.name, msg: `No kubectl context auto-detected, using first available: ${context}` })
    }
  }

  if (!context) {
    context = supportedContexts[0]
    log.debug({ section: config.name, msg: `No kubectl context configured, using default: ${context}` })
  }

  if (context === "minikube") {
    await execa("minikube", ["config", "set", "WantUpdateNotification", "false"])

    if (!defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const minikubeIp = await execa.stdout("minikube", ["ip"])
      defaultHostname = `${projectName}.${minikubeIp}.nip.io`
    }

    if (config.setupIngressController === "nginx") {
      log.debug("Using minikube's ingress addon")
      await execa("minikube", ["addons", "enable", "ingress"])
    }

    await setMinikubeDockerEnv()

  } else if (context === "microk8s") {
    const addons = ["dns", "dashboard", "registry", "storage"]

    if (config.setupIngressController === "nginx") {
      log.debug("Using microk8s's ingress addon")
      addons.push("ingress")
    }

    await configureMicrok8sAddons(log, addons)

    // Need to push to the built-in registry
    deploymentRegistry = {
      hostname: "localhost:32000",
      namespace,
    }
  } else if (config.setupIngressController === "nginx") {
    // Install nginx on init
    _systemServices.push("ingress-controller", "default-backend")
  }

  if (!defaultHostname) {
    defaultHostname = `${projectName}.local.app.garden`
  }

  const ingressClass = config.ingressClass || config.setupIngressController || undefined

  config = {
    name: config.name,
    context,
    defaultHostname,
    deploymentRegistry,
    forceSsl: false,
    imagePullSecrets: config.imagePullSecrets,
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    ingressClass,
    namespace,
    setupIngressController: config.setupIngressController,
    tlsCertificates: config.tlsCertificates,
    _system: config._system,
    _systemServices,
  }

  return { name: config.name, config }
}
