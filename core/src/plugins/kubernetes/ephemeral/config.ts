/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mkdirp, writeFile } from "fs-extra"
import { load } from "js-yaml"
import { join } from "path"
import { joiProviderName } from "../../../config/common"
import { ConfigureProviderParams } from "../../../plugin/handlers/Provider/configureProvider"
import { containerRegistryConfigSchema } from "../../container/config"
import { KubernetesConfig, k8sContextSchema, kubernetesConfigBase } from "../config"
import { EPHEMERAL_KUBERNETES_PROVIDER_NAME } from "./ephemeral"
import chalk from "chalk"
import moment from "moment"
import { remove } from "lodash"


// block defaultHostname

export const configSchema = () =>
  kubernetesConfigBase().keys({
    name: joiProviderName(EPHEMERAL_KUBERNETES_PROVIDER_NAME),
    context: k8sContextSchema().optional(),
    deploymentRegistry: containerRegistryConfigSchema().optional(),
  })

export async function configureProvider(params: ConfigureProviderParams<KubernetesConfig>) {
  const { base, log, projectName, ctx, config: baseConfig } = params
  log.info(`Configuring ${EPHEMERAL_KUBERNETES_PROVIDER_NAME} provider for project ${projectName}`)

  if (projectName === 'garden-system') {
    return {
      config: baseConfig,
    }
  }
  if (!ctx.cloudApi) {
    throw new Error(
      `You are not logged in. You must be logged into Garden Cloud in order to use ${EPHEMERAL_KUBERNETES_PROVIDER_NAME} provider.`
    )
  }
  const ephemeralClusterDirPath = join(ctx.gardenDirPath, "ephemeral-kubernetes")
  await mkdirp(ephemeralClusterDirPath)
  log.info("Creating ephemeral kubernetes cluster")
  const createEphemeralClusterResponse = await ctx.cloudApi.createEphemeralCluster()
  const clusterId = createEphemeralClusterResponse.instanceMetadata.instanceId
  log.info(`Ephemeral kubernetes cluster created successfully`)
  log.info(
    chalk.white(
      `Ephemeral cluster will be destroyed at ${moment(createEphemeralClusterResponse.instanceMetadata.deadline).format(
        "YYYY-MM-DD HH:mm:ss"
      )}`
    )
  )
  log.info("Getting Kubeconfig for the cluster")
  const kubeConfig = await ctx.cloudApi.getKubeConfigForCluster(clusterId)

  const kubeconfigFileName = `${clusterId}-kubeconfig.yaml`
  const kubeConfigPath = join(ctx.gardenDirPath, "ephemeral-kubernetes", kubeconfigFileName)
  await writeFile(kubeConfigPath, kubeConfig)
  log.info(`Kubeconfig for ephemeral cluster saved at path: ${chalk.underline(kubeConfigPath)}`)

  const parsedKubeConfig: any = load(kubeConfig)
  const currentContext = parsedKubeConfig["current-context"]
  baseConfig.context = currentContext
  baseConfig.kubeconfig = kubeConfigPath

  // set deployment registry
  baseConfig.deploymentRegistry = {
    hostname: createEphemeralClusterResponse.registry.endpointAddress,
    namespace: createEphemeralClusterResponse.registry.repository,
    insecure: false,
  }
  // set default hostname
  baseConfig.defaultHostname = `${clusterId}.fra1.namespaced.app`
  // set imagePullSecrets
  baseConfig.imagePullSecrets = [
    {
      name: "ephemeral-registry-credentials",
      namespace: "default",
    },
  ]
  // set build mode to kaniko
  baseConfig.buildMode = "kaniko"
  // set additional kaniko flags
  baseConfig.kaniko = {
    extraFlags: [
      `--registry-mirror=${createEphemeralClusterResponse.registry.endpointAddress}`,
      `--registry-mirror=${createEphemeralClusterResponse.registry.dockerRegistryMirror}`,
      "--insecure-pull",
      "--force",
    ],
  }
  let { config: updatedConfig } = await base!(params)

  const _systemServices = updatedConfig._systemServices
  const nginxServices = ["ingress-controller", "default-backend"]
  remove(_systemServices, (s) => nginxServices.includes(s))
  _systemServices.push("nginx-ephemeral")
  updatedConfig.setupIngressController = "nginx"

  params.config = updatedConfig
  return {
    config: updatedConfig,
  }
}
