/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { KubeApi } from "../api.js"
import { checkResourceStatus, waitForResources } from "../status/status.js"
import chalk from "chalk"
import { apply, deleteResources } from "../kubectl.js"
import type { DeployState } from "../../../types/service.js"
import { kindNginxGetManifests } from "./nginx-kind-manifests.js"
import { GardenIngressController } from "./ingress-controller.js"

const nginxKindMainResource = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "ingress-nginx-controller",
  },
}

export class KindGardenIngressController implements GardenIngressController {
  install(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return kindNginxInstall(ctx, log)
  }

  async ready(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
    return (await kindNginxStatus(ctx, log)) === "ready"
  }

  uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return kindNginxUninstall(ctx, log)
  }
}

async function kindNginxStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)

  const deploymentStatus = await checkResourceStatus({ api, namespace, manifest: nginxKindMainResource, log })

  log.debug(chalk.yellow(`Status of ingress controller: ${deploymentStatus.state}`))
  return deploymentStatus.state
}

async function kindNginxInstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await kindNginxStatus(ctx, log)
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
    ctx,
    provider,
    resources: [nginxKindMainResource],
    log,
    timeoutSec: 60,
  })
}

async function kindNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const status = await kindNginxStatus(ctx, log)
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
