/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../../../logger/log-entry"
import { DeployState } from "../../../types/service"
import { exec } from "../../../util/util"
import chalk from "chalk"
import { KubernetesPluginContext } from "../config"
import { KubeApi } from "../api"

interface MinikubeAddons {
  [key: string]: {
    Profile: string
    Status: string
  }
}

export async function minikubeNginxStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  // The minikube addons don't implement healthchecks, so we have to check the status of the addon and the deployment
  const provider = ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const result = await exec("minikube", ["addons", "list", "-o=json"])
  const minikubeAddons = JSON.parse(result.stdout) as MinikubeAddons
  const addonEnabled = minikubeAddons.ingress.Status === "enabled"

  let state: DeployState = addonEnabled ? "ready" : "missing"
  //check if ingress controller deployment is ready
  if (addonEnabled) {
    const nginxDeployment = await api.listResourcesForKinds({
      log,
      namespace: "ingress-nginx",
      versionedKinds: [{ apiVersion: "apps/v1", kind: "Deployment" }],
      labelSelector: { "app.kubernetes.io/name": "ingress-nginx" },
    })
    if (nginxDeployment.length === 0) {
      state = "missing"
    } else if (nginxDeployment[0].status?.numberReady === 0) {
      state = "unhealthy"
    }
  }
  log.debug(chalk.yellow(`Status of minikube ingress controller addon: ${state}`))
  return state
}

export async function minikubeNginxInstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await minikubeNginxStatus(ctx, log)
  if (status === "ready") {
    return
  }
  log.info("Enabling minikube ingress controller addon")
  await exec("minikube", ["addons", "enable", "ingress"])
}

export async function minikubeNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await minikubeNginxStatus(ctx, log)
  if (status === "missing") {
    return
  }
  log.info("Disabling minikube ingress controller addon")
  await exec("minikube", ["addons", "disable", "ingress"])
}
