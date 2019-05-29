/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as split from "split"
import { omit } from "lodash"
import moment = require("moment")

import { GetServiceLogsResult, ServiceLogEntry } from "../../types/plugin/service/getServiceLogs"
import { splitFirst } from "../../util/util"
import { kubectl } from "./kubectl"
import { KubernetesResource } from "./types"
import { getAllPodNames } from "./util"
import { KubeApi } from "./api"
import { Service } from "../../types/service"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import * as Bluebird from "bluebird"

interface GetLogsBaseParams {
  log: LogEntry
  context: string
  namespace: string
  service: Service
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail: number
}

interface GetPodLogsParams extends GetLogsBaseParams {
  podNames: string[]
}

interface GetAllLogsParams extends GetLogsBaseParams {
  resources: KubernetesResource[]
}

interface GetLogsParams extends GetLogsBaseParams {
  podName: string
}

/**
 * Stream all logs for the given pod names and service.
 */
export async function getPodLogs(params: GetPodLogsParams) {
  const procs = await Bluebird.map(params.podNames, podName => getLogs({ ...omit(params, "podNames"), podName }))

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
  const api = await KubeApi.factory(params.log, params.context)
  const podNames = await getAllPodNames(api, params.namespace, params.resources)
  return getPodLogs({ ...params, podNames })
}

async function getLogs({ log, context, namespace, service, stream, tail, follow, podName }: GetLogsParams) {
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

  kubectlArgs.push(`pod/${podName}`)

  const proc = await kubectl.spawn({ log, context, namespace, args: kubectlArgs })
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
        msg: `${podName} ${msg}`,
      })
    })

  return proc
}
