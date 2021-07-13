/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flatten } from "lodash"
import { KubeApi } from "../api"
import { KubernetesServerResource } from "../types"
import { TimeoutError } from "../../../exceptions"
import { getReadyPods } from "../util"
import { sleep } from "../../../util/util"
import { LogEntry } from "../../../logger/log-entry"

// There's something strange going on if this takes more than 10 seconds to resolve
const timeout = 10000

/**
 * Wait until Service Endpoints are correctly routing to the correct Pods.
 * Note: This assumes that the Service and Pod/workload statuses have previously been cleared as ready.
 */
export async function waitForServiceEndpoints(
  api: KubeApi,
  log: LogEntry,
  namespace: string,
  resources: KubernetesServerResource[]
) {
  const services = resources.filter((r) => r.apiVersion === "v1" && r.kind === "Service")
  const start = new Date().getTime()

  return Bluebird.map(services, async (service) => {
    const selector = service.spec.selector

    if (!selector) {
      return
    }

    const serviceName = service.metadata.name
    const serviceNamespace = service.metadata?.namespace || namespace

    const pods = await getReadyPods(api, serviceNamespace, selector)
    const readyPodNames = pods.map((p) => p.metadata.name)

    while (true) {
      const endpoints = await api.core.readNamespacedEndpoints(serviceName, serviceNamespace)

      const addresses = flatten((endpoints.subsets || []).map((subset) => subset.addresses || []))
      const routedPods = addresses.filter(
        (a) => a.targetRef!.kind === "Pod" && readyPodNames.includes(a.targetRef!.name!)
      )

      if (routedPods.length === readyPodNames.length) {
        // All endpoints routing nicely!
        break
      }

      if (new Date().getTime() - start > timeout) {
        throw new TimeoutError(`Timed out waiting for Service '${serviceName}' Endpoints to resolve to correct Pods`, {
          service,
          pods,
        })
      }

      log.setState({ symbol: "warning", msg: `Waiting for Service '${serviceName}' Endpoints to resolve...` })
      await sleep(1000)
    }
  })
}
