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

export const configSchema = () =>
  kubernetesConfigBase().keys({
    name: joiProviderName("ephemeral-kubernetes"),
    context: k8sContextSchema().optional(),
    deploymentRegistry: containerRegistryConfigSchema().optional(),
  })

export async function configureProvider(params: ConfigureProviderParams<KubernetesConfig>) {
  const { base, log, projectName, ctx, config: baseConfig } = params
  log.info("Configuring ephemeral-kubernetes provider")
  if (!ctx.cloudApi) {
    throw new Error(
      "You are not logged in. You must be logged into Garden Cloud in order to use ephemeral-kubernetes provider."
    )
  }
  const ephemeralClusterDirPath = join(ctx.gardenDirPath, "ephemeral-kubernetes")
  await mkdirp(ephemeralClusterDirPath)
  log.info("Getting ephemeral kubernetes cluster")
  const newClusterResponse = await ctx.cloudApi.createEphemeralCluster()
  const newClusterId = newClusterResponse.clustetId
  log.info("Getting kubeconfig for the cluster")
  const kubeConfig = await ctx.cloudApi.getKubeConfigForCluster(newClusterId)

  const kubeconfigFileName = `${newClusterId}-kubeconfig.yaml`
  const kubeConfigTmpPath = join(ctx.gardenDirPath, "ephemeral-kubernetes", kubeconfigFileName)
  await writeFile(kubeConfigTmpPath, kubeConfig)
  log.info(`kubeconfig saved at path: ${kubeConfigTmpPath}`)

  // const kubeConfig = DUMMY
  const parsedKubeConfig: any = load(kubeConfig)
  const currentContext = parsedKubeConfig["current-context"]
  baseConfig.context = currentContext
  baseConfig.kubeconfig = `/Users/shumail/mewtow/garden/test/ephemeral-cluster/.garden/ephemeral-kubernetes/${newClusterId}-kubeconfig.yaml`

  // set deployment registry
  baseConfig.deploymentRegistry = {
    hostname: newClusterResponse.registry.endpointAddress,
    namespace: newClusterResponse.registry.repository,
    insecure: false,
  }
  // set imagePullSecrets
  baseConfig.imagePullSecrets = [
    {
      name: "nscr-credentials",
      namespace: "default",
    },
    {
      name: "dockerhub-credentials",
      namespace: "default",
    },
  ]
  // set build mode to kaniko
  baseConfig.buildMode = "kaniko"
  // set additional kaniko flags
  baseConfig.kaniko = {
    extraFlags: [
      `--registry-mirror=${newClusterResponse.registry.endpointAddress}`,
      "--registry-mirror=10.0.0.1:6001",
      "--insecure-pull",
      "--force",
    ],
  }

  // baseConfig.setupIngressController = "nginx"

  params.config = baseConfig
  let { config: updatedConfig } = await base!(params)
  return {
    config: updatedConfig,
  }
}
