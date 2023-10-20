/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesPluginContext } from "../config.js"
import type { Log } from "../../../logger/log-entry.js"
import type { DeployState } from "../../../types/service.js"
import { KubeApi } from "../api.js"
import { checkResourceStatus, waitForResources } from "../status/status.js"
import chalk from "chalk"
import type { KubernetesDeployment, KubernetesService } from "../types.js"

export async function defaultBackendStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)
  const { deployment } = defaultBackendGetManifests(ctx)

  const deploymentStatus = await checkResourceStatus({ api, namespace, manifest: deployment, log })
  log.debug(chalk.yellow(`Status of ingress controller default-backend: ${deploymentStatus}`))
  return deploymentStatus.state
}

export async function defaultBackendInstall(ctx: KubernetesPluginContext, log: Log) {
  const { deployment, service } = defaultBackendGetManifests(ctx)
  const status = await defaultBackendStatus(ctx, log)
  if (status === "ready") {
    return
  }

  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)
  await api.upsert({ kind: "Service", namespace, log, obj: service })
  await api.upsert({ kind: "Deployment", namespace, log, obj: deployment })
  await waitForResources({ namespace, ctx, provider, resources: [deployment], log, timeoutSec: 20 })
}

export async function defaultBackendUninstall(ctx: KubernetesPluginContext, log: Log) {
  const { deployment, service } = defaultBackendGetManifests(ctx)
  const status = await defaultBackendStatus(ctx, log)
  if (status === "missing") {
    return
  }

  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)
  await api.deleteBySpec({ namespace, manifest: service, log })
  await api.deleteBySpec({ namespace, manifest: deployment, log })
}

function defaultBackendGetManifests(ctx: KubernetesPluginContext): {
  deployment: KubernetesDeployment
  service: KubernetesService
} {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace

  const deployment: KubernetesDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      labels: {
        app: "default-backend",
      },
      name: "default-backend",
      namespace,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: "default-backend",
        },
      },
      strategy: {
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 1,
        },
        type: "RollingUpdate",
      },
      template: {
        metadata: {
          labels: {
            app: "default-backend",
          },
        },
        spec: {
          containers: [
            {
              image:
                "gardendev/default-backend:v0.1@sha256:1b02920425eea569c6be53bb2e3d2c1182243212de229be375da7a93594498cf",
              imagePullPolicy: "IfNotPresent",
              name: "default-backend",
              ports: [
                {
                  containerPort: 80,
                  name: "http",
                  protocol: "TCP",
                },
              ],
              resources: {
                limits: {
                  cpu: "100m",
                  memory: "200Mi",
                },
                requests: {
                  cpu: "10m",
                  memory: "90Mi",
                },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
        },
      },
    },
  }

  const service: KubernetesService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      labels: {
        app: "default-backend",
      },
      name: "default-backend",
      namespace,
    },
    spec: {
      type: "ClusterIP",
      ports: [
        {
          name: "http",
          port: 80,
          protocol: "TCP",
          targetPort: 80,
        },
      ],
      selector: {
        app: "default-backend",
      },
    },
  }
  return { deployment, service }
}
