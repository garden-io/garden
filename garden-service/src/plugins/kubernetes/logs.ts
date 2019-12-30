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
import { KubernetesResource, KubernetesPod } from "./types"
import { getAllPods, getStaticLabelsFromPod, getSelectorString } from "./util"
import { KubeApi } from "./api"
import { Service } from "../../types/service"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import Bluebird from "bluebird"
import { KubernetesProvider } from "./config"
import { BinaryCmd } from "../../util/ext-tools"
import { kubectl } from "./kubectl"
import { splitFirst } from "../../util/util"
import { ChildProcess } from "child_process"

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

const STERN_NAME = "stern"
const STERN_TIME_OUT = 300
const stern = new BinaryCmd({
  name: STERN_NAME,
  defaultTimeout: STERN_TIME_OUT,
  specs: {
    darwin: {
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_darwin_amd64",
      sha256: "7aea3b6691d47b3fb844dfc402905790665747c1e6c02c5cabdd41994533d7e9",
    },
    linux: {
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_linux_amd64",
      sha256: "e0b39dc26f3a0c7596b2408e4fb8da533352b76aaffdc18c7ad28c833c9eb7db",
    },
    win32: {
      url: "https://github.com/wercker/stern/releases/download/1.11.0/stern_windows_amd64.exe",
      sha256: "75708b9acf6ef0eeffbe1f189402adc0405f1402e6b764f1f5152ca288e3109e",
    },
  },
})

/**
 * Stream all logs for the given pod names and service.
 */
export async function getPodLogs(params: GetPodLogsParams) {
  const procs = await Bluebird.map(params.pods, (pod) => getLogs({ ...omit(params, "pods"), pod }))

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
  if (follow) {
    return followLogs(log, provider, service, stream, tail, pod)
  }

  return readLogs(log, provider, service, stream, tail, pod)
}

async function readLogs(
  log: LogEntry,
  provider: KubernetesProvider,
  service: Service,
  stream: Stream<ServiceLogEntry>,
  tail: number,
  pod: KubernetesPod
) {
  const kubectlArgs = ["logs", "--tail", String(tail), "--timestamps=true", "--all-containers=true"]

  kubectlArgs.push(`pod/${pod.metadata.name}`)

  const proc = await kubectl.spawn({
    args: kubectlArgs,
    log,
    provider,
    namespace: pod.metadata.namespace,
  })

  handleLogMessageStreamFromProcess(proc, stream, service)
  return proc
}
async function followLogs(
  log: LogEntry,
  provider: KubernetesProvider,
  service: Service,
  stream: Stream<ServiceLogEntry>,
  tail: number,
  pod: KubernetesPod
) {
  const sternArgs = [
    `--context=${provider.config.context}`,
    `--namespace=${pod.metadata.namespace}`,
    `--exclude-container=garden-*`,
    "--tail",
    String(tail),
    "--output=json",
    "-t",
  ]

  const labels = getStaticLabelsFromPod(pod)
  if (Object.keys(labels).length > 0) {
    sternArgs.push(`${getSelectorString(labels)}`)
  } else {
    sternArgs.push(`${service.name}`)
  }

  const proc = await stern.spawn({
    args: sternArgs,
    log,
  })

  handleLogMessageStreamFromProcess(proc, stream, service, true)
  return proc
}

function handleLogMessageStreamFromProcess(
  proc: ChildProcess,
  stream: Stream<ServiceLogEntry>,
  service: Service,
  json?: boolean
) {
  let timestamp: Date

  proc.stdout!.pipe(split()).on("data", (s) => {
    if (!s) {
      return
    }
    const [timestampStr, msg] = json ? parseSternLogMessage(s) : splitFirst(s, " ")
    try {
      timestamp = moment(timestampStr).toDate()
    } catch {}
    void stream.write({
      serviceName: service.name,
      timestamp,
      msg: `${msg}`,
    })
  })
}

function parseSternLogMessage(message: string): string[] {
  let log = JSON.parse(message)
  const logMessageChunks = log.message.split(" ")
  return [
    logMessageChunks[0],
    logMessageChunks
      .slice(1, logMessageChunks.length)
      .join(" ")
      .trimEnd(),
  ]
}
