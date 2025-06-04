/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import { exec } from "../../../util/util.js"
import type { KubernetesPluginContext } from "../config.js"
import { type DeployState } from "../../../types/service.js"
import { configureMicrok8sAddons } from "../local/microk8s.js"
import { waitForResources } from "../status/status.js"
import { GardenIngressComponent } from "./ingress-controller-base.js"

export class Microk8sGardenIngressController extends GardenIngressComponent {
  override async ensure(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const provider = ctx.provider

    const status = await this.getStatus(ctx, log)
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
      waitForJobs: false,
      ctx,
      provider,
      resources: [nginxMainResource],
      log,
      timeoutSec: 60,
    })
  }

  override async getStatus(_ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
    // The microk8s addons implement healthchecks and auto-corrects the addon status
    // in case the deployment becomes unhealthy so we can just check if the addon is enabled
    const statusCommandResult = await exec("microk8s", ["status", "--format", "short"])
    const status = statusCommandResult.stdout
    const addonEnabled = status.includes("core/ingress: enabled")
    log.debug(`Status of microk8s ingress controller addon: ${addonEnabled ? "enabled" : "disabled"}`)
    return addonEnabled ? "ready" : "missing"
  }

  override async uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const status = await this.getStatus(ctx, log)
    if (status === "missing") {
      return
    }
    log.info("Disabling microk8s ingress controller addon")
    await exec("microk8s", ["disable", "ingress"])
  }
}
