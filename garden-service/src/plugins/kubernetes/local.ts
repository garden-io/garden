/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as execa from "execa"
import { safeLoad } from "js-yaml"
import * as Joi from "joi"
import { join } from "path"
import { GardenPlugin } from "../../types/plugin/plugin"
import { validate } from "../../config/common"
import {
  gardenPlugin as k8sPlugin,
  KubernetesBaseConfig,
  kubernetesConfigBase,
  KubernetesConfig,
} from "./kubernetes"
import { readFile } from "fs-extra"
import { homedir } from "os"
import { getLocalEnvironmentStatus, prepareLocalEnvironment } from "./init"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube

// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "minikube"]
const kubeConfigPath = join(homedir(), ".kube", "config")

async function getKubeConfig(): Promise<any> {
  try {
    return safeLoad((await readFile(kubeConfigPath)).toString())
  } catch {
    return {}
  }
}

/**
 * Automatically set docker environment variables for minikube
 * TODO: it would be better to explicitly provide those to docker instead of using process.env
 */
async function setMinikubeDockerEnv() {
  const minikubeEnv = await execa.stdout("minikube", ["docker-env", "--shell=bash"])
  for (const line of minikubeEnv.split("\n")) {
    const matched = line.match(/^export (\w+)="(.+)"$/)
    if (matched) {
      process.env[matched[1]] = matched[2]
    }
  }
}

export interface LocalKubernetesConfig extends KubernetesBaseConfig {
  _system?: Symbol
  _systemServices?: string[]
}

const configSchema = kubernetesConfigBase
  .keys({
    ingressHostname: Joi.string()
      .description("The hostname of the cluster's ingress controller."),
    _system: Joi.any().meta({ internal: true }),
    _systemServices: Joi.array().items(Joi.string())
      .meta({ internal: true })
      .description("The system services which should be automatically deployed to the cluster."),
  })
  .description("The provider configuration for the local-kubernetes plugin.")

export const name = "local-kubernetes"

export async function gardenPlugin({ projectName, config, log }): Promise<GardenPlugin> {
  config = validate(config, configSchema, { context: "local-kubernetes provider config" })

  let context = config.context
  let defaultHostname = config.defaultHostname
  let systemServices

  if (!context) {
    // automatically detect supported kubectl context if not explicitly configured
    const kubeConfig = await getKubeConfig()
    const currentContext = kubeConfig["current-context"]

    if (currentContext && supportedContexts.includes(currentContext)) {
      // prefer current context if set and supported
      context = currentContext
      log.debug({ section: name, msg: `Using current context: ${context}` })
    } else if (kubeConfig.contexts) {
      const availableContexts = kubeConfig.contexts.map(c => c.name)

      for (const supportedContext of supportedContexts) {
        if (availableContexts.includes(supportedContext)) {
          context = supportedContext
          log.debug({ section: name, msg: `Using detected context: ${context}` })
          break
        }
      }
    }
  }

  if (!context) {
    context = supportedContexts[0]
    log.debug({ section: name, msg: `No kubectl context auto-detected, using default: ${context}` })
  }

  if (context === "minikube") {
    await execa("minikube", ["config", "set", "WantUpdateNotification", "false"])

    if (!defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const minikubeIp = await execa.stdout("minikube", ["ip"])
      defaultHostname = `${projectName}.${minikubeIp}.nip.io`
    }

    await Promise.all([
      // TODO: wait for ingress addon to be ready, if it was previously disabled
      execa("minikube", ["addons", "enable", "ingress"]),
      setMinikubeDockerEnv(),
    ])

    systemServices = ["kubernetes-dashboard"]
  } else {
    if (!defaultHostname) {
      defaultHostname = `${projectName}.local.app.garden`
    }
  }

  const k8sConfig: KubernetesConfig = {
    name: config.name,
    context,
    defaultHostname,
    defaultUsername: "default",
    deploymentRegistry: {
      hostname: "foo.garden",   // this is not used by this plugin, but required by the base plugin
      namespace: "_",
    },
    forceSsl: false,
    imagePullSecrets: config.imagePullSecrets,
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    ingressClass: "nginx",
    tlsCertificates: config.tlsCertificates,
    _system: config._system,
    _systemServices: systemServices,
  }

  const plugin = k8sPlugin({ config: k8sConfig })

  // override the environment configuration steps
  plugin.actions!.getEnvironmentStatus = getLocalEnvironmentStatus
  plugin.actions!.prepareEnvironment = prepareLocalEnvironment

  // no need to push before deploying locally
  delete plugin.moduleActions!.container.pushModule

  return plugin
}
