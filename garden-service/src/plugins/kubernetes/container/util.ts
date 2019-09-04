/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "url"
import { ContainerModule } from "../../container/config"
import { getPortForward } from "../port-forward"
import { systemNamespace } from "../system"
import { CLUSTER_REGISTRY_DEPLOYMENT_NAME, CLUSTER_REGISTRY_PORT } from "../constants"
import { containerHelpers } from "../../container/helpers"
import { PluginError } from "../../../exceptions"
import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import axios, { AxiosRequestConfig } from "axios"

export async function queryRegistry(
  ctx: KubernetesPluginContext,
  log: LogEntry,
  path: string,
  opts: AxiosRequestConfig = {}
) {
  const registryFwd = await getRegistryPortForward(ctx, log)
  const baseUrl = `http://localhost:${registryFwd.localPort}/v2/`
  const url = resolve(baseUrl, path)

  return axios({ url, ...opts })
}

export async function getRegistryPortForward(ctx: PluginContext, log: LogEntry) {
  return getPortForward({
    ctx,
    log,
    namespace: systemNamespace,
    targetResource: `Deployment/${CLUSTER_REGISTRY_DEPLOYMENT_NAME}`,
    port: CLUSTER_REGISTRY_PORT,
  })
}

export async function getManifestFromRegistry(ctx: KubernetesPluginContext, module: ContainerModule, log: LogEntry) {
  const imageId = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)
  const imageName = containerHelpers.unparseImageId({
    ...containerHelpers.parseImageId(imageId),
    host: undefined,
    tag: undefined,
  })
  const path = `${imageName}/manifests/${module.version.versionString}`

  try {
    const res = await queryRegistry(ctx, log, path)
    log.silly(res.data)
    return res.data
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null
    } else {
      throw new PluginError(`Could not query in-cluster registry: ${err}`, {
        message: err.message,
        response: err.response,
      })
    }
  }
}
