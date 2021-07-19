/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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

  if (params.follow) {
    const logsFollower = new K8sLogFollower({ ...params, k8sApi: api })

    params.ctx.events.on("abort", () => {
      logsFollower.close()
    })

    await logsFollower.followLogs({ tail: params.tail, since: params.since })
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
    await Bluebird.map(pods, (pod) => readLogs({ ...omit(params, "pods"), pod, tail }))
  }
  return {}
}

async function readLogs({
  log,
  ctx,
  provider,
  service,
  stream,
  tail,
  pod,
  defaultNamespace,
  since,
}: {
  log: LogEntry
  ctx: PluginContext
  provider: KubernetesProvider
  service: GardenService
  stream: Stream<ServiceLogEntry>
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

  const serviceName = service.name

  const allLines = logs.flatMap(({ containerName, log: _log }) => {
    return _log.split("\n").map((line) => {
      line = line.trimEnd()
      const res = { serviceName, containerName }
      try {
        const [timestampStr, msg] = splitFirst(line, " ")
        const timestamp = moment(timestampStr).toDate()
        return { ...res, timestamp, msg }
      } catch {
        return { ...res, msg: line }
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
}

const defaultRetryIntervalMs = 10000

/**
 * A helper class for following logs and managing the logs connections.
 *
 * The class operates kind of like a control loop, fetching the state of all pods for a given service at
 * an interval, comparing the result against current active connections and attempting re-connects as needed.
 */
export class K8sLogFollower {
  private connections: { [key: string]: LogConnection }
  private stream: Stream<ServiceLogEntry>
  private service: GardenService
  private k8sApi: KubeApi
  private defaultNamespace: string
  private resources: KubernetesResource<BaseResource>[]
  private intervalId: NodeJS.Timer | null
  private resolve: ((val: unknown) => void) | null
  private retryIntervalMs: number

  constructor({
    service,
    stream,
    defaultNamespace,
    k8sApi,
    resources,
    retryIntervalMs = defaultRetryIntervalMs,
  }: {
    service: GardenService
    stream: Stream<ServiceLogEntry>
    k8sApi: KubeApi
    defaultNamespace: string
    resources: KubernetesResource<BaseResource>[]
    retryIntervalMs?: number
  }) {
    this.stream = stream
    this.connections = {}
    this.k8sApi = k8sApi
    this.service = service
    this.defaultNamespace = defaultNamespace
    this.resources = resources
    this.intervalId = null
    this.resolve = null
    this.retryIntervalMs = retryIntervalMs
  }

  /**
   * Start following logs. This function doesn't return and simply keeps running
   * until outside code calls the close method.
   */
  public async followLogs(opts: LogOpts = {}) {
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
      this.write({
        msg: `<Lost connection to container '${conn.containerName}' in Pod '${conn.pod.metadata.name}'. Reason: ${reason}. Will retry in background...>`,
        containerName: conn.containerName,
        level: LogLevel.debug,
      })
    }
  }

  private async createConnections({ tail, since }: LogOpts) {
    let pods: KubernetesPod[]

    try {
      pods = await getAllPods(this.k8sApi, this.defaultNamespace, this.resources)
    } catch (err) {
      // Log the error and keep trying.
      this.write({
        msg: `<Getting pods failed with error: ${err?.message}>`,
        level: LogLevel.debug,
      })
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
      this.write({
        msg: `<No running containers found for service. Will retry in ${this.retryIntervalMs / 1000}s...>`,
        level: LogLevel.debug,
      })
    }

    await Bluebird.map(containers, async ({ pod, containerName }) => {
      const connectionId = this.getConnectionId(pod, containerName)
      // Cast type to make it explicit that it can be undefined
      const conn = this.connections[connectionId] as LogConnection | undefined

      if (conn && conn.status === "connected") {
        // Nothing to do
        return
      } else if (conn) {
        // The connection has been registered but is not active
        this.write({
          msg: `<Not connected to container ${conn.containerName} in Pod ${conn.pod.metadata.name}. Connection has status ${conn?.status}>`,
          level: LogLevel.silly,
        })
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
          _self.write({
            msg,
            containerName,
            timestamp,
          })
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
          tail,
          timestamps: true,
          // If we're retrying, presunmably because the connection was cut, we only want the latest logs.
          // Otherwise we might end up fetching logs that have already been rendered.
          since: isRetry ? "10s" : since,
        })
      } catch (err) {
        // Log the error and keep trying.
        this.write({
          msg: `<Getting logs for container '${containerName}' in Pod '${pod.metadata.name}' failed with error: ${err?.message}>`,
          level: LogLevel.debug,
          containerName,
        })
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
        this.write({
          msg: `<Connected to container '${containerName}' in Pod '${pod.metadata.name}'>`,
          containerName,
          level: LogLevel.debug,
        })
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
          this.write({
            msg: `<Socket has been idle for ${socketTimeoutMs / 1000}s, will restart connection>`,
            containerName,
            level: LogLevel.debug,
          })
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
    tail,
    since,
    timestamps,
  }: {
    namespace: string
    podName: string
    containerName: string
    stream: Writable
    tail?: number
    timestamps?: boolean
    since?: string
    doneCallback: (err: any) => void
  }) {
    const logger = this.k8sApi.getLogger()
    const sinceSeconds = since ? parseDuration(since, "s") || undefined : undefined

    const opts = {
      follow: true,
      limitBytes: 5000,
      pretty: false,
      previous: false,
      sinceSeconds,
      tailLines: tail,
      timestamps,
    }

    return logger.log(namespace, podName, containerName, stream, doneCallback, opts)
  }

  private getConnectionId(pod: KubernetesPod, containerName: string) {
    return `${pod.metadata.name}-${containerName}`
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
    void this.stream.write({
      serviceName: this.service.name,
      timestamp,
      msg,
      containerName,
      level,
    })
  }
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
