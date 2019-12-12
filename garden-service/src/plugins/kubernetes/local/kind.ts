/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec } from "../../../util/util"
import { kubectl } from "../kubectl"
import { LogEntry } from "../../../logger/log-entry"
import { safeLoad } from "js-yaml"

const CLUSTER_NOT_FOUND = "CLUSTER_NOT_FOUND"

export async function loadLocalImage(buildResult: any, config: any, log: LogEntry): Promise<void> {
  try {
    const clusterName = await getClusterForContext(config.context)
    if (clusterName != CLUSTER_NOT_FOUND) {
      await exec("kind", ["load", "docker-image", buildResult.details.identifier, `--name=${clusterName}`])
    }
  } catch (err) {
    log.error(
      `An attempt to load the image ${buildResult.details.identifier} into kind cluster with context ${config.context} failed`
    )
    throw err
  }
}

export async function isClusterKind(provider: any, log: LogEntry) {
  return (await isKindInstalled(log)) && (await isKindContext(log, provider))
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

async function isKindContext(log: LogEntry, provider: any): Promise<boolean> {
  const params = {
    log,
    provider,
    namespace: "kube-system",
    args: ["get", "DaemonSet", "kindnet"],
  }
  try {
    await kubectl.stdout(params)
    return true
  } catch (err) {
    log.debug(`An attempt to get kindnet deamonset failed with ${err}`)
  }

  return false
}

async function getKindClusters(): Promise<Array<string>> {
  try {
    const clusters = (await exec("kind", ["get", "clusters"])).stdout
    if (clusters) {
      return clusters.split("\n")
    }
    return Promise.resolve([])
  } catch (err) {}
  return Promise.resolve([])
}

async function getClusterForContext(context: string): Promise<string> {
  for (let cluster of await getKindClusters()) {
    if (await isContextAMatch(cluster, context)) {
      return cluster
    }
  }
  return Promise.resolve(CLUSTER_NOT_FOUND)
}

async function isContextAMatch(cluster: string, context: string): Promise<Boolean> {
  const kubeConfigString = (await exec("kind", ["get", "kubeconfig", `--name=${cluster}`])).stdout
  const kubeConfig = safeLoad(kubeConfigString)

  return kubeConfig["current-context"] === context
}
