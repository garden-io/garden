/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import split from "split"
import { omit, sortBy } from "lodash"
import moment from "moment"

import { GetServiceLogsResult, ServiceLogEntry } from "../../types/plugin/service/getServiceLogs"
import { KubernetesResource, KubernetesPod } from "./types"
import { getAllPods, getStaticLabelsFromPod, getSelectorString } from "./util"
import { KubeApi } from "./api"
import { Service } from "../../types/service"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import Bluebird from "bluebird"
import { KubernetesProvider } from "./config"
import { PluginToolSpec } from "../../types/plugin/tools"
import { PluginContext } from "../../plugin-context"
import { getPodLogs } from "./status/pod"
import { splitFirst } from "../../util/util"

interface GetAllLogsParams {
  ctx: PluginContext
  defaultNamespace: string
  log: LogEntry
  provider: KubernetesProvider
  service: Service
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail: number
  resources: KubernetesResource[]
}

/**
 * Stream all logs for the given resources and service.
 */
export async function streamK8sLogs(params: GetAllLogsParams) {
  const api = await KubeApi.factory(params.log, params.ctx, params.provider)
  const pods = await getAllPods(api, params.defaultNamespace, params.resources)

  if (params.follow) {
    const procs = await Bluebird.map(pods, (pod) => followLogs({ ...omit(params, "pods"), pod })).filter(Boolean)

    return new Promise<GetServiceLogsResult>((resolve, reject) => {
      // Make sure to resolve if no processes get created
      if (procs.length === 0) {
        return resolve({})
      }
      for (const proc of procs) {
        proc.on("error", () => reject)

        proc.on("exit", () => resolve({}))
      }
    })
  } else {
    await Bluebird.map(pods, (pod) => readLogsFromApi({ ...omit(params, "pods"), pod }))
    return {}
  }
}

async function readLogsFromApi({
  log,
  ctx,
  provider,
  service,
  stream,
  tail,
  pod,
  defaultNamespace,
}: {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  service: Service
  stream: Stream<ServiceLogEntry>
  tail?: number
  pod: KubernetesPod
  defaultNamespace: string
}) {
  const api = await KubeApi.factory(log, ctx, provider)

  const logs = await getPodLogs({
    api,
    namespace: pod.metadata.namespace || defaultNamespace,
    pod,
    lineLimit: tail === -1 ? undefined : tail,
    timestamps: true,
  })

  const serviceName = service.name

  const allLines = logs.flatMap(({ containerName, log: _log }) => {
    return _log.split("\n").map((line) => {
      try {
        const [timestampStr, msg] = splitFirst(line, " ")
        const timestamp = moment(timestampStr).toDate()
        return { serviceName, timestamp, msg: formatLine(containerName, msg) }
      } catch {
        return { serviceName, msg: formatLine(containerName, line) }
      }
    })
  })

  for (const line of sortBy(allLines, "timestamp")) {
    void stream.write(line)
  }
}

function formatLine(containerName: string, line: string) {
  return chalk.gray(containerName + " → ") + line.trimEnd()
}

async function followLogs({
  ctx,
  log,
  provider,
  service,
  stream,
  tail,
  pod,
  defaultNamespace,
}: {
  ctx: PluginContext
  log: LogEntry
  provider: KubernetesProvider
  service: Service
  stream: Stream<ServiceLogEntry>
  tail: number
  pod: KubernetesPod
  defaultNamespace: string
}) {
  const sternArgs = [
    `--context=${provider.config.context}`,
    `--namespace=${pod.metadata.namespace || defaultNamespace}`,
    `--exclude-container=garden-*`,
    "--tail",
    String(tail),
    "--output=json",
    "-t",
  ]

  if (provider.config.kubeconfig) {
    sternArgs.push(`--kubeconfig=${provider.config.kubeconfig}`)
  }

  /* Getting labels on the pod with no numbers,
  The Idea is these labels are less likely to change between different deployments of these pods
  */
  const labels = getStaticLabelsFromPod(pod)
  if (Object.keys(labels).length > 0) {
    sternArgs.push(`${getSelectorString(labels)}`)
  } else {
    sternArgs.push(`${service.name}`)
  }

  const proc = await ctx.tools["kubernetes.stern"].spawn({
    args: sternArgs,
    log,
  })

  proc.stdout!.pipe(split()).on("data", (s: Buffer) => {
    if (!s) {
      return
    }
    let timestamp: Date | undefined = undefined
    let msg: string
    try {
      const parsed = JSON.parse(s.toString())
      let [timestampStr, line] = splitFirst(parsed.message, " ")
      msg = formatLine(parsed.containerName, line)
      timestamp = moment(timestampStr).toDate()
    } catch (err) {
      /**
       * If the message was supposed to be JSON but parsing failed, we stream the message unparsed. It may contain
       * error information useful for debugging.
       */
      msg = s.toString()
    }
    void stream.write({
      serviceName: service.name,
      timestamp,
      msg,
    })
  })

  return proc
}

export const sternSpec: PluginToolSpec = {
  name: "stern",
  description: "Utility CLI for streaming logs from Kubernetes.",
  type: "binary",
  _includeInGardenImage: true,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_darwin_amd64",
      sha256: "7aea3b6691d47b3fb844dfc402905790665747c1e6c02c5cabdd41994533d7e9",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_linux_amd64",
      sha256: "e0b39dc26f3a0c7596b2408e4fb8da533352b76aaffdc18c7ad28c833c9eb7db",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_windows_amd64.exe",
      sha256: "75708b9acf6ef0eeffbe1f189402adc0405f1402e6b764f1f5152ca288e3109e",
    },
  ],
}
