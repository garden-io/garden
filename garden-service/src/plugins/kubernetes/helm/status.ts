/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceStatus, ServiceState, ForwardablePort } from "../../../types/service"
import { GetServiceStatusParams } from "../../../types/plugin/service/getServiceStatus"
import { LogEntry } from "../../../logger/log-entry"
import { helm } from "./helm-cli"
import { HelmModule } from "./config"
import { getReleaseName } from "./common"
import { KubernetesPluginContext } from "../config"
import { getForwardablePorts } from "../port-forward"
import { KubernetesServerResource } from "../types"
import { safeLoadAll } from "js-yaml"

const helmStatusCodeMap: { [code: number]: ServiceState } = {
  // see https://github.com/kubernetes/helm/blob/master/_proto/hapi/release/status.proto
  0: "unknown", // UNKNOWN
  1: "ready", // DEPLOYED
  2: "missing", // DELETED
  3: "stopped", // SUPERSEDED
  4: "unhealthy", // FAILED
  5: "stopped", // DELETING
  6: "deploying", // PENDING_INSTALL
  7: "deploying", // PENDING_UPGRADE
  8: "deploying", // PENDING_ROLLBACK
}

interface HelmStatusDetail {
  remoteResources?: KubernetesServerResource[]
}

export type HelmServiceStatus = ServiceStatus<HelmStatusDetail>

export async function getServiceStatus({
  ctx,
  module,
  log,
  hotReload,
}: GetServiceStatusParams<HelmModule>): Promise<HelmServiceStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const releaseName = getReleaseName(module)

  const detail: HelmStatusDetail = {}
  let state: ServiceState

  try {
    const helmStatus = await getReleaseStatus(k8sCtx, module, releaseName, log, hotReload)
    state = helmStatus.state
  } catch (err) {
    state = "missing"
  }

  let forwardablePorts: ForwardablePort[] = []

  if (state !== "missing") {
    const deployedResources = safeLoadAll(
      await helm({
        ctx: k8sCtx,
        log,
        args: ["get", "manifest", releaseName],
      })
    )
    forwardablePorts = getForwardablePorts(deployedResources)
  }

  return {
    forwardablePorts,
    state,
    version: state === "ready" ? module.version.versionString : undefined,
    detail,
  }
}

export async function getReleaseStatus(
  ctx: KubernetesPluginContext,
  module: HelmModule,
  releaseName: string,
  log: LogEntry,
  hotReload: boolean
): Promise<ServiceStatus> {
  try {
    log.silly(`Getting the release status for ${releaseName}`)
    const res = JSON.parse(await helm({ ctx, log, args: ["status", releaseName, "--output", "json"] }))
    const statusCode = res.info.status.code
    let state = helmStatusCodeMap[statusCode]
    let values = {}

    if (state === "ready") {
      // Make sure the right version is deployed
      values = JSON.parse(
        await helm({
          ctx,
          log,
          args: ["get", "values", releaseName, "--output", "json"],
        })
      )
      const deployedVersion = values[".garden"] && values[".garden"].version
      const hotReloadEnabled = values[".garden"] && values[".garden"].hotReload === true

      if ((hotReload && !hotReloadEnabled) || !deployedVersion || deployedVersion !== module.version.versionString) {
        state = "outdated"
      }
    }

    return {
      state,
      detail: { ...res, values },
    }
  } catch (_) {
    // release doesn't exist
    return { state: "missing", detail: {} }
  }
}
