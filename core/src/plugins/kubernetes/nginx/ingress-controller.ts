/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { GardenIngressComponent } from "./ingress-controller-base.js"
import type { DeployState } from "../../../types/service.js"

class NoOpGardenIngressController extends GardenIngressComponent {
  override ensure(_ctx: KubernetesPluginContext, _log: Log): Promise<void> {
    return Promise.resolve(undefined)
  }

  override getStatus(_ctx: KubernetesPluginContext, _log: Log): Promise<DeployState> {
    return Promise.resolve("missing")
  }

  override async ready(_ctx: KubernetesPluginContext, _log: Log): Promise<boolean> {
    return false
  }

  override uninstall(_ctx: KubernetesPluginContext, _log: Log): Promise<void> {
    return Promise.resolve(undefined)
  }
}

export function getGardenIngressController(ctx: KubernetesPluginContext): GardenIngressComponent {
  const clusterType = ctx.provider.config.clusterType
  switch (clusterType) {
    case undefined:
      return new NoOpGardenIngressController()
    case "kind":
      return new KindGardenIngressController()
    case "microk8s":
      return new Microk8sGardenIngressController()
    case "minikube":
      return new MinikubeGardenIngressController()
    case "k3s":
      return new K3sHelmGardenIngressController()
    case "generic":
      return new GenericHelmGardenIngressController()
    default:
      return clusterType satisfies never
  }
}

export async function ingressControllerReady(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
  return await getGardenIngressController(ctx).ready(ctx, log)
}

export async function ensureIngressController(ctx: KubernetesPluginContext, log: Log) {
  await getGardenIngressController(ctx).ensure(ctx, log)
}

export async function ingressControllerUninstall(ctx: KubernetesPluginContext, log: Log) {
  return await getGardenIngressController(ctx).uninstall(ctx, log)
}
