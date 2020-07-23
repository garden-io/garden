/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubernetesConfig, kubernetesConfigBase, k8sContextSchema } from "../config"
import { ConfigureProviderParams } from "../../../types/plugin/provider/configureProvider"
import { joiProviderName, joi } from "../../../config/common"
import { getKubeConfig } from "../api"
import { configureMicrok8sAddons } from "./microk8s"
import { setMinikubeDockerEnv } from "./minikube"
import { exec } from "../../../util/util"
import { remove } from "lodash"
import { getNfsStorageClass } from "../init"
import { isClusterKind } from "./kind"
import { ConfigurationError } from "../../../exceptions"
import { deline, naturalList } from "../../../util/string"
import chalk from "chalk"

// TODO: split this into separate plugins to handle Docker for Mac and Minikube

// note: this is in order of preference, in case neither is set as the current kubectl context
// and none is explicitly configured in the garden.yml
const supportedContexts = ["docker-for-desktop", "docker-desktop", "microk8s", "minikube"]
const nginxServices = ["ingress-controller", "default-backend"]

export interface LocalKubernetesConfig extends KubernetesConfig {
  setupIngressController: string | null
}

export const configSchema = kubernetesConfigBase
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
  const { base, log, projectName, tools } = params
  let { config } = await base!(params)

  const _systemServices = config._systemServices

  // create dummy provider with just enough info needed for the getKubeConfig function
  const provider = {
    name: config.name,
    dependencies: {},
    config,
    moduleConfigs: [],
    status: { ready: true, outputs: {} },
    tools,
  }
  const kubeConfig = await getKubeConfig(log, provider)
  const currentContext = kubeConfig["current-context"]

  if (!config.context) {
    // automatically detect supported kubectl context if not explicitly configured
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
  }

  // No context set or automatically detected
  if (!config.context) {
    const msg = chalk.red(deline`
      Missing Kubernetes context.\n

      The ${chalk.bold("context")} field is empty and no context auto-detected. Either set
      the ${chalk.bold("context")} field manually or make sure one of the supported local-kubernetes contexts
      is set in your kubeconfig file.

      Garden detects the following contexts automatically: ${naturalList(
        supportedContexts.map((ctx) => chalk.bold(ctx))
      )}
    `)
    throw new ConfigurationError(msg, {
      supportedContexts,
      currentContext,
    })
  }

  if (await isClusterKind(provider, log)) {
    config.clusterType = "kind"
  }
  if (config.context === "minikube") {
    await exec("minikube", ["config", "set", "WantUpdateNotification", "false"])

    config.clusterType = "minikube"

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
