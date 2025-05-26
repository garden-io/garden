/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "../../../util/util.js"
import type { Log } from "../../../logger/log-entry.js"
import { load } from "js-yaml"
import type { KubernetesConfig, KubernetesProvider } from "../config.js"
import { GardenError, RuntimeError } from "../../../exceptions.js"
import { KubeApi } from "../api.js"
import type { KubernetesResource } from "../types.js"
import type { PluginContext } from "../../../plugin-context.js"
import { containerHelpers } from "../../container/helpers.js"

const nodeCache: { [context: string]: string[] } = {}

export async function getKindImageStatus(config: KubernetesConfig, imageId: string, log: Log): Promise<boolean> {
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

  await Promise.all(
    nodes.map(async (nodeName) => {
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
  )

  if (ready) {
    log.debug(`Image ${imageId} has been loaded into kind cluster`)
  } else {
    log.debug(`Image ${imageId} is not in kind cluster`)
  }

  return ready
}

export async function loadImageToKind(imageId: string, config: KubernetesConfig, log: Log): Promise<void> {
  log.debug(`Loading image ${imageId} into kind cluster`)

  try {
    const clusterName = await getClusterForContext(config.context)
    if (clusterName !== null) {
      await exec("kind", ["load", "docker-image", imageId, `--name=${clusterName}`])
    }
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    throw new RuntimeError({
      message: `An attempt to load image ${imageId} into the kind cluster failed: ${err.message}`,
      wrappedErrors: [err],
    })
  }
}

export async function isKindCluster(ctx: PluginContext, provider: KubernetesProvider, log: Log): Promise<boolean> {
  return (await isKindInstalled(log)) && (await isKindContext(ctx, provider, log))
}

async function isKindInstalled(log: Log): Promise<boolean> {
  try {
    const kindVersion = (await exec("kind", ["version"])).stdout
    log.debug(`Found kind with the following version details ${kindVersion}`)
    return true
  } catch (err) {
    log.debug(`An attempt to get kind version failed with ${err}`)
  }

  return false
}

async function isKindContext(ctx: PluginContext, provider: KubernetesProvider, log: Log): Promise<boolean> {
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
  const clusters = await getKindClusters()
  for (const cluster of clusters) {
    if (await contextMatches(cluster, context)) {
      return cluster
    }
  }
  return null
}

async function contextMatches(cluster: string, context: string): Promise<boolean> {
  try {
    const kubeConfigString = (await exec("kind", ["get", "kubeconfig", `--name=${cluster}`])).stdout
    const kubeConfig = load(kubeConfigString)!
    return kubeConfig["current-context"] === context
  } catch (err) {}
  return false
}
