/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit, sortBy } from "lodash"
import moment from "moment"
import parseDuration from "parse-duration"

import { ServiceLogEntry } from "../../types/plugin/service/getServiceLogs"
import { KubernetesResource, KubernetesPod, BaseResource } from "./types"
import { getAllPods } from "./util"
import { KubeApi } from "./api"
import { GardenService } from "../../types/service"
import Stream from "ts-stream"
import { LogEntry } from "../../logger/log-entry"
import Bluebird from "bluebird"
import { KubernetesProvider } from "./config"
import { PluginToolSpec } from "../../types/plugin/tools"
import { PluginContext } from "../../plugin-context"
import { getPodLogs } from "./status/pod"
import { splitFirst } from "../../util/util"
import { Writable } from "stream"
import request from "request"
import { LogLevel } from "../../logger/logger"

// When not following logs, the entire log is read into memory and sorted.
// We therefore set a maximum on the number of lines we fetch.
const maxLogLinesInMemory = 100000

interface GetAllLogsParams {
  ctx: PluginContext
  defaultNamespace: string
  log: LogEntry
  provider: KubernetesProvider
  service: GardenService
  stream: Stream<ServiceLogEntry>
  follow: boolean
  tail?: number
  since?: string
  resources: KubernetesResource[]
}

/**
 * Stream all logs for the given resources and service.
 */
export async function streamK8sLogs(params: GetAllLogsParams) {
  const api = await KubeApi.factory(params.log, params.ctx, params.provider)
  const entryConverter = makeServiceLogEntry(params.service.name)

  if (params.follow) {
    const logsFollower = new K8sLogFollower({ ...params, entryConverter, k8sApi: api, log: params.ctx.log })

    params.ctx.events.on("abort", () => {
      logsFollower.close()
    })

    await logsFollower.followLogs({ tail: params.tail, since: params.since, limitBytes: null })
  } else {
    const pods = await getAllPods(api, params.defaultNamespace, params.resources)
    let tail = params.tail
    if (!tail) {
      const containers = pods.flatMap((pod) => {
        return pod.spec!.containers.map((c) => c.name).filter((n) => !n.match(/garden-/))
      })
      tail = Math.floor(maxLogLinesInMemory / containers.length)

      params.log.debug(`Tail parameter not set explicitly. Setting to ${tail} to prevent log overflow.`)
    }
    await Bluebird.map(pods, (pod) => readLogs({ ...omit(params, "pods"), entryConverter, pod, tail }))
  }
  return {}
}

async function readLogs<T>({
  log,
  ctx,
  provider,
  stream,
  entryConverter,
  tail,
  pod,
  defaultNamespace,
  since,
}: {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  stream: Stream<T>
  entryConverter: PodLogEntryConverter<T>
  tail?: number
  pod: KubernetesPod
  defaultNamespace: string
  since?: string
}) {
  const api = await KubeApi.factory(log, ctx, provider)

  const logs = await getPodLogs({
    api,
    namespace: pod.metadata?.namespace || defaultNamespace,
    pod,
    lineLimit: tail,
    timestamps: true,
    sinceSeconds: since ? parseDuration(since, "s") || undefined : undefined,
  })

  const allLines = logs.flatMap(({ containerName, log: _log }) => {
    return _log.split("\n").map((line) => {
      line = line.trimEnd()
      const res = { containerName }
      try {
        const [timestampStr, msg] = splitFirst(line, " ")
        const timestamp = moment(timestampStr).toDate()
        return entryConverter({ ...res, timestamp, msg })
      } catch {
        return entryConverter({ ...res, msg: line })
      }
    })
  })

  for (const line of sortBy(allLines, "timestamp")) {
    void stream.write(line)
  }
}

type ConnectionStatus = "connected" | "error" | "closed"

interface LogConnection {
  pod: KubernetesPod
  containerName: string
  namespace: string
  request: request.Request
  status: ConnectionStatus
}

interface LogOpts {
  tail?: number
  since?: string
  /**
   * If set to null, does not limit the number of bytes. This parameter is made mandatory, so that the usage site
   * makes a deliberate and informed choice about it.
   *
   * From the k8s javascript client library docs:
   *
   * "If set, the number of bytes to read from the server before terminating the log output. This may not display a
   * complete final line of logging, and may return slightly more or slightly less than the specified limit.""
   */
  limitBytes: number | null
}

const defaultRetryIntervalMs = 10000

/**
 * The maximum number of streamed entries to keep around to compare incoming entries against for deduplication
 * purposes.
 *
 * One such buffer is maintained for each container for each resource the `K8sLogFollower` instance
 * is following (and deduplication is performed separately for each followed container).
 *
 * Deduplication is needed e.g. when the connection with a container is lost and reestablished, and recent logs are
 * re-fetched. Some of those log entries may have the same timestamp and message as recently streamed entries,
 * and not re-streaming them if they match an entry in the deduplication buffer is usually the desired behavior
 * (since it prevents duplicate log lines).
 *
 * The deduplication buffer size should be kept relatively small, since a large buffer adds a slight delay before
 * entries are streamed.
 */
const defaultDeduplicationBufferSize = 500

/**
 * A helper class for following logs and managing the logs connections.
 *
 * The class operates kind of like a control loop, fetching the state of all pods for a given service at
 * an interval, comparing the result against current active connections and attempting re-connects as needed.
 */
export class K8sLogFollower<T> {
  private connections: { [key: string]: LogConnection }
  private stream: Stream<T>
  private entryConverter: PodLogEntryConverter<T>
  private k8sApi: KubeApi
  private log: LogEntry
  private deduplicationBufferSize: number
  private deduplicationBuffers: { [key: string]: { msg: string; time: number }[] }
  private defaultNamespace: string
  private resources: KubernetesResource<BaseResource>[]
  private intervalId: NodeJS.Timer | null
  private resolve: ((val: unknown) => void) | null
  private retryIntervalMs: number

  constructor({
    stream,
    entryConverter,
    defaultNamespace,
    k8sApi,
    log,
    deduplicationBufferSize = defaultDeduplicationBufferSize,
    resources,
    retryIntervalMs = defaultRetryIntervalMs,
  }: {
    stream: Stream<T>
    entryConverter: PodLogEntryConverter<T>
    k8sApi: KubeApi
    log: LogEntry
    deduplicationBufferSize?: number
    defaultNamespace: string
    resources: KubernetesResource<BaseResource>[]
    retryIntervalMs?: number
  }) {
    this.stream = stream
    this.entryConverter = entryConverter
    this.connections = {}
    this.k8sApi = k8sApi
    this.log = log
    this.deduplicationBufferSize = deduplicationBufferSize
    this.defaultNamespace = defaultNamespace
    this.resources = resources
    this.intervalId = null
    this.resolve = null
    this.retryIntervalMs = retryIntervalMs
    this.deduplicationBuffers = {}
  }

  /**
   * Start following logs. This function doesn't return and simply keeps running
   * until outside code calls the close method.
   */
  public async followLogs(opts: LogOpts) {
    await this.createConnections(opts)

    this.intervalId = setInterval(async () => {
      await this.createConnections(opts)
    }, this.retryIntervalMs)

    return new Promise((resolve, _reject) => {
      this.resolve = resolve
    })
  }

  /**
   * Cleans up all active network requests and resolves the promise that was created
   * when the logs following was started.
   */
  public close() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    Object.values(this.connections).forEach((conn) => {
      try {
        conn.request.abort()
      } catch {}
    })
    this.resolve && this.resolve({})
  }

  private handleConnectionClose(connectionId: string, status: ConnectionStatus, reason: string) {
    const conn = this.connections[connectionId]
    const prevStatus = conn.status
    this.connections[connectionId] = {
      ...conn,
      status,
    }

    // There's no need to log the closed event that happens after an error event
    if (!(prevStatus === "error" && status === "closed")) {
      this.log.silly(
        `<Lost connection to container '${conn.containerName}' in Pod '${conn.pod.metadata.name}'. Reason: ${reason}. Will retry in background...>`
      )
    }
  }

  private async createConnections({ tail, since, limitBytes }: LogOpts) {
    let pods: KubernetesPod[]

    try {
      pods = await getAllPods(this.k8sApi, this.defaultNamespace, this.resources)
    } catch (err) {
      // Log the error and keep trying.
      this.log.debug(`<Getting pods failed with error: ${err?.message}>`)
      return
    }
    const containers = pods.flatMap((pod) => {
      const podContainers = pod.spec!.containers.map((c) => c.name).filter((n) => !n.match(/garden-/))
      return podContainers.map((containerName) => ({
        pod,
        containerName,
      }))
    })

    if (containers.length === 0) {
      this.log.debug(`<No running containers found for service. Will retry in ${this.retryIntervalMs / 1000}s...>`)
    }

    await Bluebird.map(containers, async ({ pod, containerName }) => {
      const connectionId = this.getConnectionId(pod, containerName)
      // Cast type to make it explicit that it can be undefined
      const conn = this.connections[connectionId] as LogConnection | undefined
      const podName = pod.metadata.name

      if (conn && conn.status === "connected") {
        // Nothing to do
        return
      } else if (conn) {
        // The connection has been registered but is not active
        this.log.silly(
          `<Not connected to container ${conn.containerName} in Pod ${conn.pod.metadata.name}. Connection has status ${conn?.status}>`
        )
      }

      const isRetry = !!conn?.status
      const namespace = pod.metadata?.namespace || this.defaultNamespace

      const _self = this
      // The ts-stream library that we use for service logs entries doesn't properly implement
      // a writeable stream which the K8s API expects so we wrap it here.
      const writableStream = new Writable({
        write(chunk, _encoding, next) {
          const line = chunk?.toString()?.trimEnd()

          if (!line) {
            return
          }

          let timestamp: Date | undefined
          // Fallback to printing the full line if we can't parse the timestamp
          let msg = line
          try {
            const parts = splitFirst(line, " ")
            timestamp = new Date(parts[0])
            msg = parts[1]
          } catch {}
          if (_self.deduplicate({ msg, podName, containerName, timestamp })) {
            _self.write({
              msg,
              containerName,
              timestamp,
            })
          }
          next()
        },
      })

      const doneCallback = (error: any) => {
        if (error) {
          this.handleConnectionClose(connectionId, "error", error.message)
        }
      }

      let req: request.Request
      try {
        req = await this.getPodLogs({
          namespace,
          containerName,
          podName: pod.metadata.name,
          doneCallback,
          stream: writableStream,
          limitBytes,
          tail,
          timestamps: true,
          // If we're retrying, presunmably because the connection was cut, we only want the latest logs.
          // Otherwise we might end up fetching logs that have already been rendered.
          since: isRetry ? "10s" : since,
        })
      } catch (err) {
        // Log the error and keep trying.
        this.log.debug(
          `<Getting logs for container '${containerName}' in Pod '${pod.metadata.name}' failed with error: ${err?.message}>`
        )
        return
      }
      this.connections[connectionId] = {
        namespace,
        pod,
        request: req,
        containerName,
        status: <LogConnection["status"]>"connected",
      }

      req.on("response", async () => {
        this.log.silly(`<Connected to container '${containerName}' in Pod '${pod.metadata.name}'>`)
      })
      req.on("error", (error) => this.handleConnectionClose(connectionId, "error", error.message))
      req.on("close", () => this.handleConnectionClose(connectionId, "closed", "Request closed"))
      req.on("socket", (socket) => {
        // If the socket is idle for 30 seconds, we kill the connection and reconnect.
        const socketTimeoutMs = 30000
        socket.setTimeout(socketTimeoutMs)
        socket.setKeepAlive(true, socketTimeoutMs / 2)
        socket.on("error", (err) => {
          this.handleConnectionClose(connectionId, "error", `Socket error: ${err.message}`)
        })
        socket.on("timeout", () => {
          this.log.debug(`<Socket has been idle for ${socketTimeoutMs / 1000}s, will restart connection>`)
          // This will trigger a "close" event which we handle separately
          socket.destroy()
        })
      })
    })
  }

  private async getPodLogs({
    namespace,
    podName,
    containerName,
    doneCallback,
    stream,
    limitBytes,
    tail,
    since,
    timestamps,
  }: {
    namespace: string
    podName: string
    containerName: string
    stream: Writable
    limitBytes: null | number
    tail?: number
    timestamps?: boolean
    since?: string
    doneCallback: (err: any) => void
  }) {
    const logger = this.k8sApi.getLogger()
    const sinceSeconds = since ? parseDuration(since, "s") || undefined : undefined

    const opts = {
      follow: true,
      pretty: false,
      previous: false,
      sinceSeconds,
      tailLines: tail,
      timestamps,
    }

    if (limitBytes) {
      opts["limitBytes"] = limitBytes
    }

    return logger.log(namespace, podName, containerName, stream, doneCallback, opts)
  }

  private getConnectionId(pod: KubernetesPod, containerName: string) {
    return `${pod.metadata.name}-${containerName}`
  }

  /**
   * Returns `false` if an entry with the same message and timestamp has already been buffered for the given `podName`
   * and `containerNamee`. Returns `true` otherwise.
   */
  private deduplicate({
    msg,
    podName,
    containerName,
    timestamp = new Date(),
  }: {
    msg: string
    podName: string
    containerName?: string
    timestamp?: Date
  }): boolean {
    const key = `${podName}.${containerName}`
    const buffer = this.deduplicationBuffers[key] || []
    const time = timestamp ? timestamp.getTime() : 0
    const duplicate = !!buffer.find((e) => e.msg === msg && e.time === time)
    if (duplicate) {
      return false
    }
    buffer.push({ msg, time })
    if (buffer.length > this.deduplicationBufferSize) {
      buffer.shift()
    }
    this.deduplicationBuffers[key] = buffer
    return true
  }

  private write({
    msg,
    containerName,
    level = LogLevel.info,
    timestamp = new Date(),
  }: {
    msg: string
    containerName?: string
    level?: LogLevel
    timestamp?: Date
  }) {
    void this.stream.write(
      this.entryConverter({
        timestamp,
        msg,
        level,
        containerName,
      })
    )
  }
}

export interface PodLogEntryConverterParams {
  msg: string
  containerName?: string
  level?: LogLevel
  timestamp?: Date
}

export type PodLogEntryConverter<T> = (p: PodLogEntryConverterParams) => T

export const makeServiceLogEntry: (serviceName: string) => PodLogEntryConverter<ServiceLogEntry> = (serviceName) => {
  return ({ timestamp, msg, level, containerName }: PodLogEntryConverterParams) => ({
    serviceName,
    timestamp,
    msg,
    level,
    tags: {
      container: containerName || "",
    },
  })
}

// DEPRECATED: Remove stern in v0.13
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
