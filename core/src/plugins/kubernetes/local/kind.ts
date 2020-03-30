/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "../../../util/util"
import { LogEntry } from "../../../logger/log-entry"
import { safeLoad } from "js-yaml"
import { BuildResult } from "../../../types/plugin/module/build"
import { KubernetesConfig, KubernetesProvider } from "../config"
import { RuntimeError } from "../../../exceptions"
import { KubeApi } from "../api"
import { KubernetesResource } from "../types"
import { PluginContext } from "../../../plugin-context"
import { BuildStatus } from "../../../types/plugin/module/getBuildStatus"
import { containerHelpers } from "../../container/helpers"
import Bluebird from "bluebird"

const nodeCache: { [context: string]: string[] } = {}

export async function getKindImageStatus(
  config: KubernetesConfig,
  imageId: string,
  log: LogEntry
): Promise<BuildStatus> {
  const parsedId = containerHelpers.parseImageId(imageId)
  const clusterId = containerHelpers.unparseImageId({
    ...parsedId,
    host: parsedId.host || "docker.io",
    namespace: parsedId.namespace || "library",
  })

  log.debug(`Checking if image ${imageId} has been loaded into kind cluster`)

  // Get the nodes in the kind cluster, and cache the result to avoid a performance hit on every status check
  let nodes = nodeCache[config.context]

  if (!nodes) {
    const clusterName = await getClusterForContext(config.context)
    const nodesRes = await exec("kind", ["get", "nodes", "--name", clusterName!])
    nodes = nodesRes.stdout.split("\n")
    nodeCache[config.context] = nodes
  }

  // Check if the image exists on all nodes
  let ready = true

  await Bluebird.map(nodes, async (nodeName) => {
    const imagesRes = await exec("docker", ["exec", "-i", nodeName, "crictl", "images", "--output=json", clusterId])
    const images = JSON.parse(imagesRes.stdout)
    for (const image of images.images) {
      if (image.repoTags.includes(clusterId)) {
        // Found it
        return
      }
    }
    // Didn't find it
    ready = false
  })

  if (ready) {
    log.debug(`Image ${imageId} has been loaded into kind cluster`)
  } else {
    log.debug(`Image ${imageId} is not in kind cluster`)
  }

  return { ready }
}

export async function loadImageToKind(
  buildResult: BuildResult,
  config: KubernetesConfig,
  log: LogEntry
): Promise<void> {
  const imageId = buildResult.details.identifier
  log.debug(`Loading image ${imageId} into kind cluster`)

  try {
    const clusterName = await getClusterForContext(config.context)
    if (clusterName !== null) {
      await exec("kind", ["load", "docker-image", imageId, `--name=${clusterName}`])
    }
  } catch (err) {
    throw new RuntimeError(
      `An attempt to load image ${buildResult.details.identifier} into the kind cluster failed: ${err.message}`,
      { err }
    )
  }
}

export async function isKindCluster(ctx: PluginContext, provider: KubernetesProvider, log: LogEntry): Promise<boolean> {
  return (await isKindInstalled(log)) && (await isKindContext(ctx, provider, log))
}

async function isKindInstalled(log: LogEntry): Promise<boolean> {
  try {
    const kindVersion = (await exec("kind", ["version"])).stdout
    log.debug(`Found kind with the following version details ${kindVersion}`)
    return true
  } catch (err) {
    log.debug(`An attempt to get kind version failed with ${err}`)
  }

  return false
}

async function isKindContext(ctx: PluginContext, provider: KubernetesProvider, log: LogEntry): Promise<boolean> {
  const kubeApi = await KubeApi.factory(log, ctx, provider)
  const manifest: KubernetesResource = {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: {
      name: "kindnet",
    },
  }
  try {
    await kubeApi.readBySpec({ namespace: "kube-system", manifest, log })
    return true
  } catch (err) {
    log.debug(`An attempt to get kind daemonset failed with ${err}`)
  }

  return false
}

async function getKindClusters(): Promise<Array<string>> {
  try {
    const clusters = (await exec("kind", ["get", "clusters"])).stdout
    if (clusters) {
      return clusters.split("\n")
    }
    return []
  } catch (err) {}
  return []
}

async function getClusterForContext(context: string) {
  for (let cluster of await getKindClusters()) {
    if (await isContextAMatch(cluster, context)) {
      return cluster
    }
  }
  return null
}

async function isContextAMatch(cluster: string, context: string): Promise<Boolean> {
  try {
    const kubeConfigString = (await exec("kind", ["get", "kubeconfig", `--name=${cluster}`])).stdout
    const kubeConfig = safeLoad(kubeConfigString)!
    return kubeConfig["current-context"] === context
  } catch (err) {}
  return false
}
