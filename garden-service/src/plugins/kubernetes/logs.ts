/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split from "split"
import { omit } from "lodash"
import moment = require("moment")

import { GetServiceLogsResult, ServiceLogEntry } from "../../types/plugin/service/getServiceLogs"
import { splitFirst } from "../../util/util"
import { kubectl } from "./kubectl"
import { KubernetesResource, KubernetesPod } from "./types"
import { getAllPods } from "./util"
import { KubeApi } from "./api"
import { Service } from "../../types/service"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import Bluebird from "bluebird"
import { KubernetesProvider } from "./config"

interface GetLogsBaseParams {
  defaultNamespace: string
  log: LogEntry
  provider: KubernetesProvider
  service: Service
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail: number
}

interface GetPodLogsParams extends GetLogsBaseParams {
  pods: KubernetesPod[]
}

interface GetAllLogsParams extends GetLogsBaseParams {
  resources: KubernetesResource[]
}

interface GetLogsParams extends GetLogsBaseParams {
  pod: KubernetesPod
}

/**
 * Stream all logs for the given pod names and service.
 */
export async function getPodLogs(params: GetPodLogsParams) {
  const procs = await Bluebird.map(params.pods, pod => getLogs({ ...omit(params, "pods"), pod }))

  return new Promise<GetServiceLogsResult>((resolve, reject) => {
    for (const proc of procs) {
      proc.on("error", reject)

      proc.on("exit", () => {
        resolve({})
      })
    }
  })
}

/**
 * Stream all logs for the given resources and service.
 */
export async function getAllLogs(params: GetAllLogsParams) {
  const api = await KubeApi.factory(params.log, params.provider)
  const pods = await getAllPods(api, params.defaultNamespace, params.resources)
  return getPodLogs({ ...params, pods })
}

async function getLogs({ log, provider, service, stream, tail, follow, pod }: GetLogsParams) {
  // TODO: do this via API instead of kubectl
  const kubectlArgs = [
    "logs",
    "--tail", String(tail),
    "--timestamps=true",
    "--all-containers=true",
  ]

  if (follow) {
    kubectlArgs.push("--follow=true")
  }

  kubectlArgs.push(`pod/${pod.metadata.name}`)

  const proc = await kubectl.spawn({
    args: kubectlArgs,
    log,
    provider,
    namespace: pod.metadata.namespace,
  })
  let timestamp: Date

  proc.stdout!
    .pipe(split())
    .on("data", (s) => {
      if (!s) {
        return
      }
      const [timestampStr, msg] = splitFirst(s, " ")
      try {
        timestamp = moment(timestampStr).toDate()
      } catch { }
      void stream.write({
        serviceName: service.name,
        timestamp,
        msg: `${pod.metadata.name} ${msg}`,
      })
    })

  return proc
}
