/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"

import { GardenPlugin } from "../../types/plugin/plugin"
import { helmHandlers } from "./helm/handlers"
import { getAppNamespace, getMetadataNamespace } from "./namespace"
import { getSecret, setSecret, deleteSecret } from "./secrets"
import { getEnvironmentStatus, prepareEnvironment, cleanupEnvironment } from "./init"
import { containerHandlers, mavenContainerHandlers } from "./container/handlers"
import { kubernetesHandlers } from "./kubernetes-module/handlers"
import { ConfigureProviderParams } from "../../types/plugin/provider/configureProvider"
import { DebugInfo, GetDebugInfoParams } from "../../types/plugin/provider/getDebugInfo"
import { systemNamespace, systemMetadataNamespace } from "./system"
import { kubectl } from "./kubectl"
import { KubernetesConfig, KubernetesPluginContext } from "./config"
import { configSchema } from "./config"
import { ConfigurationError } from "../../exceptions"
import { cleanupClusterRegistry } from "./commands/cleanup-cluster-registry"
import { clusterInit } from "./commands/cluster-init"
import { uninstallGardenServices } from "./commands/uninstall-garden-services"
import chalk from "chalk"
import { joi, joiIdentifier } from "../../config/common"

export const name = "kubernetes"

export async function configureProvider({ projectName, config }: ConfigureProviderParams<KubernetesConfig>) {
  config._systemServices = []

  if (!config.namespace) {
    config.namespace = projectName
  }

  if (config.setupIngressController === "nginx") {
    config._systemServices.push("ingress-controller", "default-backend")
  }

  if (config.buildMode === "cluster-docker" || config.buildMode === "kaniko") {
    // TODO: support external registry
    // This is a special configuration, used in combination with the registry-proxy service,
    // to make sure every node in the cluster can resolve the image from the registry we deploy in-cluster.
    config.deploymentRegistry = {
      hostname: `127.0.0.1:5000`,
      namespace: config.namespace,
    }

    // Deploy build services on init
    config._systemServices.push("build-sync", "docker-registry", "registry-proxy", "nfs-provisioner")

    if (config.buildMode === "cluster-docker") {
      config._systemServices.push("docker-daemon")
    }

  } else if (config.name !== "local-kubernetes" && !config.deploymentRegistry) {
    throw new ConfigurationError(
      `kubernetes: must specify deploymentRegistry in config if using local build mode`,
      { config },
    )
  }

  return { name: config.name, config }
}

export async function debugInfo({ ctx, log, includeProject }: GetDebugInfoParams): Promise<DebugInfo> {
  const k8sContext = <KubernetesPluginContext>ctx
  const { context } = k8sContext.provider.config
  const entry = log.info({ section: ctx.provider.name, msg: "collecting provider configuration", status: "active" })
  const namespacesList = [systemNamespace, systemMetadataNamespace]
  if (includeProject) {
    const appNamespace = await getAppNamespace(k8sContext, log, k8sContext.provider)
    const appMetadataNamespace = await getMetadataNamespace(k8sContext, log, k8sContext.provider)
    namespacesList.push(appNamespace, appMetadataNamespace)
  }
  const namespaces = await Bluebird.map(namespacesList, async (ns) => {
    const nsEntry = entry.info({ section: ns, msg: "collecting namespace configuration", status: "active" })
    const out = await kubectl.stdout({ log, context, args: ["get", "all", "--namespace", ns, "--output", "json"] })
    nsEntry.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })
    return {
      namespace: ns,
      output: JSON.parse(out),
    }
  })
  entry.setSuccess({ msg: chalk.green(`Done (took ${log.getDuration(1)} sec)`), append: true })

  const version = await kubectl.stdout({ log, context, args: ["version", "--output", "json"] })

  return {
    info: { version: JSON.parse(version), namespaces },
  }
}

const outputsSchema = joi.object()
  .keys({
    "app-namespace": joiIdentifier()
      .required()
      .description("The primary namespace used for resource deployments."),
    "metadata-namespace": joiIdentifier()
      .required()
      .description("The namespace used for Garden metadata."),
  })

export function gardenPlugin(): GardenPlugin {
  return {
    configSchema,
    outputsSchema,
    commands: [
      cleanupClusterRegistry,
      clusterInit,
      uninstallGardenServices,
    ],
    actions: {
      configureProvider,
      getEnvironmentStatus,
      prepareEnvironment,
      cleanupEnvironment,
      getSecret,
      setSecret,
      deleteSecret,
      getDebugInfo: debugInfo,
    },
    moduleActions: {
      "container": containerHandlers,
      // TODO: we should find a way to avoid having to explicitly specify the key here
      "maven-container": mavenContainerHandlers,
      "helm": helmHandlers,
      "kubernetes": kubernetesHandlers,
    },
  }
}
