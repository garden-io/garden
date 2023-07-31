/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mkdirp, writeFile } from "fs-extra";
import { joi, joiProviderName } from "../../../config/common";
import { ConfigureProviderParams } from "../../../plugin/handlers/Provider/configureProvider";
import { KubernetesConfig, k8sContextSchema, kubernetesConfigBase } from "../config";
import { join } from "path";
import { load } from "js-yaml";
import { containerRegistryConfigSchema } from "../../container/config";


export const configSchema = () => kubernetesConfigBase().keys({
  name: joiProviderName("ephemeral-kubernetes"),
  context: k8sContextSchema().optional(),
  deploymentRegistry: containerRegistryConfigSchema().optional()
})

export async function configureProvider(params: ConfigureProviderParams<KubernetesConfig>) {
  const { base, log, projectName, ctx, config: baseConfig } = params
  log.info(`projectName: ${projectName}`)
  log.info("configure provider ephemeral")
  if (ctx.cloudApi) {
    // user is logged in
    // create cluster
    console.log("user is logged in")
    const newClusterResponse = await ctx.cloudApi.createEphemeralCluster()
    const newClusterId = newClusterResponse.clustetId
    const kubeConfig = await ctx.cloudApi.getKubeConfigForCluster(newClusterId)
    console.log("kubeconfig-xaxa", kubeConfig)

    const kubeconfigFileName = `${newClusterId}-kubeconfig.yaml`
    console.log("ctx.gardenDirPath", ctx.gardenDirPath)
    const dirPath = join(ctx.gardenDirPath, "ephemeral-kubernetes")
    await mkdirp(dirPath)
    const kubeConfigTmpPath = join(ctx.gardenDirPath, "ephemeral-kubernetes", kubeconfigFileName)
    await writeFile(kubeConfigTmpPath, kubeConfig)
    console.log("kubeconfig path", kubeConfigTmpPath)
    console.log(`   $ kubectl --kubeconfig=${kubeConfigTmpPath} get all`);

    // const kubeConfig = DUMMY
    const parsedKubeConfig: any = load(kubeConfig)
    const currentContext = parsedKubeConfig["current-context"]
    console.log("currentcontext", currentContext)
    baseConfig.context = currentContext
    // config.kubeconfig = `/Users/shumail/mewtow/garden/test/ephemeral-cluster/.garden/ephemeral-kubernetes/smebtm18r0sve-kubeconfig.yaml`
    baseConfig.kubeconfig = `/Users/shumail/mewtow/garden/test/ephemeral-cluster/.garden/ephemeral-kubernetes/${newClusterId}-kubeconfig.yaml`

    // set deployment registry
    baseConfig.deploymentRegistry = {
      hostname: newClusterResponse.registry.endpointAddress,
      namespace: newClusterResponse.registry.repository,
      insecure: false
    }
    // set imagePullSecrets
    baseConfig.imagePullSecrets = [
      {
        name: 'nscr-credentials',
        namespace: 'default'
      },
      {
        name: 'dockerhub-credentials',
        namespace: 'default'
      }
    ]
    // set build mode to kaniko
    baseConfig.buildMode = "kaniko"
    // set additional kaniko flags
    baseConfig.kaniko = {
      extraFlags: [`--registry-mirror=${newClusterResponse.registry.endpointAddress}`, "--registry-mirror=10.0.0.1:6001", "--insecure-pull",  "--force"]
    }

    params.config = baseConfig
    let { config: updatedConfig } = await base!(params)
    return {
      config: updatedConfig
    }

  } else {
    throw new Error("Not logged in!")
  }

}
