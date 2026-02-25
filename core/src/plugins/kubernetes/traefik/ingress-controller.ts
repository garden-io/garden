/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { HelmGardenTraefikController } from "./traefik-helm.js"
import { GardenIngressComponent } from "../nginx/ingress-controller-base.js"
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

export function getTraefikIngressController(ctx: KubernetesPluginContext): GardenIngressComponent {
  const clusterType = ctx.provider.config.clusterType
  if (!clusterType) {
    return new NoOpGardenIngressController()
  }
  return new HelmGardenTraefikController(clusterType)
}

export async function traefikIngressControllerReady(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
  return await getTraefikIngressController(ctx).ready(ctx, log)
}

export async function ensureTraefikIngressController(ctx: KubernetesPluginContext, log: Log) {
  await getTraefikIngressController(ctx).ensure(ctx, log)
}

export async function traefikIngressControllerUninstall(ctx: KubernetesPluginContext, log: Log) {
  return await getTraefikIngressController(ctx).uninstall(ctx, log)
}
