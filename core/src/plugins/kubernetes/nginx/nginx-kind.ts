/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { KubeApi } from "../api.js"
import { checkResourceStatus, waitForResources } from "../status/status.js"
import { apply, deleteResources } from "../kubectl.js"
import type { DeployState } from "../../../types/service.js"
import { kindNginxGetManifests } from "./nginx-kind-manifests.js"
import { GardenIngressComponent } from "./ingress-controller-base.js"

const nginxKindMainResource = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "ingress-nginx-controller",
  },
}

export class KindGardenIngressController extends GardenIngressComponent {
  override async ensure(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const status = await this.getStatus(ctx, log)
    if (status === "ready") {
      return
    }

    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace
    const api = await KubeApi.factory(log, ctx, provider)

    const manifests = kindNginxGetManifests(namespace)

    log.info("Installing ingress controller for kind cluster")
    await apply({ log, ctx, api, provider, manifests, namespace })

    await waitForResources({
      // setting the action name to providers is necessary to display the logs in provider-section
      actionName: "providers",
      namespace,
      waitForJobs: false,
      ctx,
      provider,
      resources: [nginxKindMainResource],
      log,
      timeoutSec: 60,
    })
  }

  override async getStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace
    const api = await KubeApi.factory(log, ctx, provider)

    const deploymentStatus = await checkResourceStatus({ api, namespace, manifest: nginxKindMainResource, log })

    log.debug(`Status of ingress controller: ${deploymentStatus.state}`)
    return deploymentStatus.state
  }

  override async uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const status = await this.getStatus(ctx, log)
    if (status === "missing") {
      return
    }

    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace

    const manifests = kindNginxGetManifests(namespace)

    log.info("Uninstalling ingress controller for kind cluster")
    await deleteResources({ log, ctx, provider, namespace, resources: manifests })
  }
}
