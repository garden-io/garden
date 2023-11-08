/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { GenericHelmGardenIngressController } from "./nginx-helm-generic.js"
import { K3sHelmGardenIngressController } from "./nginx-helm-k3s.js"
import { Microk8sGardenIngressController } from "./nginx-microk8s.js"
import { MinikubeGardenIngressController } from "./nginx-minikube.js"
import { KindGardenIngressController } from "./nginx-kind.js"
import { EphemeralHelmGardenIngressController } from "./nginx-helm-ephemeral.js"

export interface GardenIngressController {
  install: (ctx: KubernetesPluginContext, log: Log) => Promise<void>
  uninstall: (ctx: KubernetesPluginContext, log: Log) => Promise<void>
  ready: (ctx: KubernetesPluginContext, log: Log) => Promise<boolean>
}

export function getGardenIngressController(ctx: KubernetesPluginContext): GardenIngressController | undefined {
  const clusterType = ctx.provider.config.clusterType
  if (clusterType === undefined) {
    return undefined
  }

  if (clusterType === "kind") {
    return new KindGardenIngressController()
  } else if (clusterType === "microk8s") {
    return new Microk8sGardenIngressController()
  } else if (clusterType === "minikube") {
    return new MinikubeGardenIngressController()
  } else if (clusterType === "k3s") {
    return new K3sHelmGardenIngressController()
  } else if (clusterType === "generic") {
    return new GenericHelmGardenIngressController()
  } else if (clusterType === "ephemeral") {
    return new EphemeralHelmGardenIngressController()
  } else {
    return clusterType satisfies never
  }
}

export async function ingressControllerReady(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
  const gardenIngressController = getGardenIngressController(ctx)
  if (!gardenIngressController) {
    return false
  }

  return await gardenIngressController.ready(ctx, log)
}

export async function ingressControllerInstall(ctx: KubernetesPluginContext, log: Log) {
  const gardenIngressController = getGardenIngressController(ctx)
  if (!gardenIngressController) {
    return
  }

  await gardenIngressController.install(ctx, log)
}

export async function ingressControllerUninstall(ctx: KubernetesPluginContext, log: Log) {
  const gardenIngressController = getGardenIngressController(ctx)
  if (!gardenIngressController) {
    return
  }

  return await gardenIngressController.uninstall(ctx, log)
}
