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
import { readFile } from "fs-extra"
import { homedir } from "os"
import { KubernetesBaseConfig, kubernetesConfigBase } from "../kubernetes"
import { ConfigureProviderParams } from "../../../types/plugin/params"

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
  setupIngressController: string | null
}

export const configSchema = kubernetesConfigBase
  .keys({
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
  let setupIngressController = config.setupIngressController

  if (!context) {
    // automatically detect supported kubectl context if not explicitly configured
    const kubeConfig = await getKubeConfig()
    const currentContext = kubeConfig["current-context"]

    if (currentContext && supportedContexts.includes(currentContext)) {
      // prefer current context if set and supported
      context = currentContext
      log.debug({ section: config.name, msg: `Using current context: ${context}` })
    } else if (kubeConfig.contexts) {
      const availableContexts = kubeConfig.contexts.map(c => c.name)

      for (const supportedContext of supportedContexts) {
        if (availableContexts.includes(supportedContext)) {
          context = supportedContext
          log.debug({ section: config.name, msg: `Using detected context: ${context}` })
          break
        }
      }
    }
  }

  if (!context) {
    context = supportedContexts[0]
    log.debug({ section: config.name, msg: `No kubectl context auto-detected, using default: ${context}` })
  }

  if (context === "minikube") {
    await execa("minikube", ["config", "set", "WantUpdateNotification", "false"])

    if (!defaultHostname) {
      // use the nip.io service to give a hostname to the instance, if none is explicitly configured
      const minikubeIp = await execa.stdout("minikube", ["ip"])
      defaultHostname = `${projectName}.${minikubeIp}.nip.io`
    }

    if (config.setupIngressController === "nginx") {
      log.silly("Using minikube's ingress addon")
      await execa("minikube", ["addons", "enable", "ingress"])
      // make sure the prepare handler doesn't also set up the ingress controller
      setupIngressController = null
    }

    await setMinikubeDockerEnv()

  } else {
    if (!defaultHostname) {
      defaultHostname = `${projectName}.local.app.garden`
    }
  }

  const ingressClass = config.ingressClass || config.setupIngressController || undefined

  config = {
    name: config.name,
    context,
    defaultHostname,
    forceSsl: false,
    imagePullSecrets: config.imagePullSecrets,
    ingressHttpPort: 80,
    ingressHttpsPort: 443,
    ingressClass,
    namespace: config.namespace || projectName,
    setupIngressController,
    tlsCertificates: config.tlsCertificates,
    _system: config._system,
  }

  return { name: config.name, config }
}
