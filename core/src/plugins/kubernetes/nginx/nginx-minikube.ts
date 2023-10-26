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
import { checkResourceStatus, waitForResources } from "../status/status"

interface MinikubeAddons {
  [key: string]: {
    Profile: string
    Status: string
  }
}

const nginxKindMainResource = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "ingress-nginx-controller",
  },
}

export async function minikubeNginxStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  // The minikube addons don't implement healthchecks, so we have to check the status of the addon and the deployment
  const provider = ctx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const result = await exec("minikube", ["addons", "list", "-o=json"])
  const minikubeAddons = JSON.parse(result.stdout) as MinikubeAddons
  const addonEnabled = minikubeAddons.ingress.Status === "enabled"

  if (!addonEnabled) {
    log.debug(chalk.yellow("Status of minikube ingress controller addon: missing"))
    return "missing"
  }
  //check if ingress controller deployment is ready
  const deploymentStatus = await checkResourceStatus({
    api,
    namespace: "ingress-nginx",
    manifest: nginxKindMainResource,
    log,
  })
  log.debug(chalk.yellow(`Status of minikube ingress controller addon: ${deploymentStatus.state}`))
  return deploymentStatus.state
}

export async function minikubeNginxInstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const status = await minikubeNginxStatus(ctx, log)
  if (status === "ready") {
    return
  }
  log.info("Enabling minikube ingress controller addon")
  await exec("minikube", ["addons", "enable", "ingress"])
  await waitForResources({
    // setting the action name to providers is necessary to display the logs in provider-section
    actionName: "providers",
    namespace: "ingress-nginx",
    ctx,
    provider,
    resources: [nginxKindMainResource],
    log,
    timeoutSec: 60,
  })
}

export async function minikubeNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await minikubeNginxStatus(ctx, log)
  if (status === "missing") {
    return
  }
  log.info("Disabling minikube ingress controller addon")
  await exec("minikube", ["addons", "disable", "ingress"])
}
