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

export async function loadImageToKind(buildResult: BuildResult, config: KubernetesConfig): Promise<void> {
  try {
    const clusterName = await getClusterForContext(config.context)
    if (clusterName !== null) {
      await exec("kind", ["load", "docker-image", buildResult.details.identifier, `--name=${clusterName}`])
    }
  } catch (err) {
    throw new RuntimeError(
      `An attempt to load image ${buildResult.details.identifier} into the kind cluster failed: ${err.message}`,
      { err }
    )
  }
}

export async function isClusterKind(provider: KubernetesProvider, log: LogEntry): Promise<boolean> {
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

async function isKindContext(log: LogEntry, provider: KubernetesProvider): Promise<boolean> {
  const kubeApi = await KubeApi.factory(log, provider)
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
    const kubeConfig = safeLoad(kubeConfigString)
    return kubeConfig["current-context"] === context
  } catch (err) {}
  return false
}
