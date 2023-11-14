/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten } from "lodash-es"
import type { KubeApi } from "../api.js"
import type { KubernetesServerResource } from "../types.js"
import { TimeoutError } from "../../../exceptions.js"
import { getReadyPods } from "../util.js"
import { sleep } from "../../../util/util.js"
import type { Log } from "../../../logger/log-entry.js"

// There's something strange going on if this takes more than 10 seconds to resolve
const timeout = 10000

/**
 * Wait until Service Endpoints are correctly routing to the correct Pods.
 * Note: This assumes that the Service and Pod/workload statuses have previously been cleared as ready.
 */
export async function waitForServiceEndpoints(
  api: KubeApi,
  log: Log,
  namespace: string,
  resources: KubernetesServerResource[]
) {
  const services = resources.filter((r) => r.apiVersion === "v1" && r.kind === "Service")
  const start = new Date().getTime()

  return Promise.all(
    services.map(async (service) => {
      const selector = service.spec.selector

      if (!selector) {
        return
      }

      const serviceName = service.metadata.name
      const serviceNamespace = service.metadata?.namespace || namespace

      const pods = await getReadyPods(api, serviceNamespace, selector)
      const readyPodNames = pods.map((p) => p.metadata.name)

      while (true) {
        const endpoints = await api.core.readNamespacedEndpoints({ name: serviceName, namespace: serviceNamespace })

        const addresses = flatten((endpoints.subsets || []).map((subset) => subset.addresses || []))
        const routedPods = addresses.filter(
          (a) => a.targetRef!.kind === "Pod" && readyPodNames.includes(a.targetRef!.name!)
        )

        if (routedPods.length === readyPodNames.length) {
          // All endpoints routing nicely!
          break
        }

        if (new Date().getTime() - start > timeout) {
          throw new TimeoutError({
            message: `Timed out waiting for Service '${serviceName}' Endpoints to resolve to correct Pods.`,
          })
        }

        log.info(`Waiting for Service '${serviceName}' Endpoints to resolve...`)
        await sleep(1000)
      }
    })
  )
}
