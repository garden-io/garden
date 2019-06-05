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

export const name = "kubernetes"

export async function configureProvider({ projectName, config }: ConfigureProviderParams<KubernetesConfig>) {
  config._systemServices = []

  if (!config.namespace) {
    config.namespace = projectName
  }

  if (config.setupIngressController === "nginx") {
    config._systemServices.push("ingress-controller", "default-backend")
  }

  if (config.buildMode === "cluster-docker") {
    if (config.deploymentRegistry) {
      throw new ConfigurationError(
        `kubernetes: deploymentRegistry should not be set in config if using cluster-docker build mode`,
        { config },
      )
    }

    // This is a special configuration, used in combination with the registry-proxy service,
    // to make sure every node in the cluster can resolve the image from the registry we deploy in-cluster.
    config.deploymentRegistry = {
      hostname: `127.0.0.1:5000`,
      // The base configure handler ensures that the namespace is set
      namespace: config.namespace!,
    }

    // Deploy build services on init
    config._systemServices.push("docker-daemon", "docker-registry", "registry-proxy")

  } else if (!config.deploymentRegistry) {
    throw new ConfigurationError(
      `kubernetes: must specify deploymentRegistry in config if using local build mode`,
      { config },
    )
  }

  return { name: config.name, config }
}

export async function debugInfo({ ctx, log }: GetDebugInfoParams): Promise<DebugInfo> {
  const k8sContext = <KubernetesPluginContext>ctx
  const { context } = k8sContext.provider.config
  const appNamespace = await getAppNamespace(k8sContext, log, k8sContext.provider)
  const appMetadataNamespace = await getMetadataNamespace(k8sContext, log, k8sContext.provider)

  const namespacesList = [appNamespace, appMetadataNamespace, systemNamespace, systemMetadataNamespace]
  const namespaces = await Bluebird.map(namespacesList, async (ns) => {
    const out = await kubectl.stdout({ log, context, args: ["get", "all", "--namespace", ns, "--output", "json"] })
    return {
      namespace: ns,
      output: JSON.parse(out),
    }
  })

  const version = await kubectl.stdout({ log, context, args: ["version", "--output", "json"] })

  return {
    info: { version: JSON.parse(version), namespaces },
  }
}

export function gardenPlugin(): GardenPlugin {
  return {
    configSchema,
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
