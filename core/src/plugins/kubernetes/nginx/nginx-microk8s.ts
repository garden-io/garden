/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import { exec } from "../../../util/util.js"
import chalk from "chalk"
import type { KubernetesPluginContext } from "../config.js"
import { type DeployState } from "../../../types/service.js"
import { configureMicrok8sAddons } from "../local/microk8s.js"
import { waitForResources } from "../status/status.js"
import { GardenIngressController } from "./ingress-controller.js"

export class Microk8sGardenIngressController implements GardenIngressController {
  install(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return microk8sNginxInstall(ctx, log)
  }

  async ready(_ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
    return (await microk8sNginxStatus(log)) === "ready"
  }

  uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return microk8sNginxUninstall(ctx, log)
  }
}

async function microk8sNginxStatus(log: Log): Promise<DeployState> {
  // The microk8s addons implement healthchecks and auto-corrects the addon status
  // in case the deployment becomes unhealthy so we can just check if the addon is enabled
  const statusCommandResult = await exec("microk8s", ["status", "--format", "short"])
  const status = statusCommandResult.stdout
  const addonEnabled = status.includes("core/ingress: enabled")
  log.debug(chalk.yellow(`Status of microk8s ingress controller addon: ${addonEnabled ? "enabled" : "disabled"}`))
  return addonEnabled ? "ready" : "missing"
}

async function microk8sNginxInstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider

  const status = await microk8sNginxStatus(log)
  if (status === "ready") {
    return
  }
  log.info("Enabling microk8s ingress controller addon")
  await configureMicrok8sAddons(log, ["ingress"])
  const nginxMainResource = {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: {
      name: "nginx-ingress-microk8s-controller",
    },
  }
  await waitForResources({
    // setting the action name to providers is necessary to display the logs in provider-section
    actionName: "providers",
    namespace: "ingress",
    ctx,
    provider,
    resources: [nginxMainResource],
    log,
    timeoutSec: 60,
  })
}

async function microk8sNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await microk8sNginxStatus(log)
  if (status === "missing") {
    return
  }
  log.info("Disabling microk8s ingress controller addon")
  await exec("microk8s", ["disable", "ingress"])
}
