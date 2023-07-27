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

const DUMMY = "apiVersion:"


export const configSchema = () => kubernetesConfigBase().keys({
  name: joiProviderName("ephemeral-kubernetes"),
  context: k8sContextSchema().optional()
})

export async function configureProvider(params: ConfigureProviderParams<KubernetesConfig>) {
  const { base, log, projectName, ctx } = params
  let { config } = await base!(params)
  console.log("projectName", projectName)
  log.info("configure provider ephemeral")
  if (ctx.cloudApi) {
    // user is logged in
    // create cluster
    console.log("user is logged in")
    // throw new Error("user logged in")
    // const newClusterId = await ctx.cloudApi.createEphemeralCluster()
    // console.log("newcluster", newClusterId)
    // const kubeConfig = await ctx.cloudApi.getKubeConfigForCluster(newClusterId)
    // console.log("kubeconfig", kubeConfig)
    const kubeConfig = DUMMY
    // const newClusterId = "s1icfhau7d5q2"
    // // const kubeconfigFileName = `${newClusterId}-kubeconfig.yaml`

    // // console.log("ctx.gardenDirPath", ctx.gardenDirPath)
    // // const dirPath = join(ctx.gardenDirPath, "ephemeral-kubernetes")
    // // await mkdirp(dirPath)
    // // const kubeConfigTmpPath = join(ctx.gardenDirPath, "ephemeral-kubernetes", kubeconfigFileName)
    // // await writeFile(kubeConfigTmpPath, kubeConfig)
    // console.log("kubeconfig path", kubeConfigTmpPath)
    // console.log(`   $ kubectl --kubeconfig=${kubeConfigTmpPath} get all`);

    const parsedKubeConfig: any = load(kubeConfig)
    const currentContext = parsedKubeConfig["current-context"]
    console.log("currentcontext", currentContext)
    config.context = currentContext
    config.kubeconfig = '/Users/shumail/mewtow/garden/test/ephemeral-cluster/.garden/ephemeral-kubernetes/s1icfhau7d5q2-kubeconfig.yaml'
  } else {
    throw new Error("blabla")
  }

  // console.log("user is NOT logged in")
  return {
    config
  }
}
