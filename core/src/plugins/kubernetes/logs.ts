/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { omit, sortBy } from "lodash-es"
import parseDuration from "parse-duration"

import type { DeployLogEntry } from "../../types/service.js"
import type { KubernetesResource, KubernetesPod, BaseResource } from "./types.js"
import { getAllPods, summarize } from "./util.js"
import { KubeApi, KubernetesError } from "./api.js"
import type { Log } from "../../logger/log-entry.js"
import type { KubernetesProvider } from "./config.js"
import type { PluginContext } from "../../plugin-context.js"
import { getPodLogs } from "./status/pod.js"
import { isValidDateInstance, sleep } from "../../util/util.js"
import { Writable } from "stream"
import { LogLevel } from "../../logger/logger.js"
import { splitFirst } from "../../util/string.js"
import { toKubernetesError } from "./retry.js"
import type { DeployLogEntryHandler } from "../../plugin/handlers/Deploy/get-logs.js"

// When not following logs, the entire log is read into memory and sorted.
// We therefore set a maximum on the number of lines we fetch.
const maxLogLinesInMemory = 100000

interface GetAllLogsParams {
  ctx: PluginContext
  defaultNamespace: string
  log: Log
  provider: KubernetesProvider
  actionName: string
  onLogEntry: DeployLogEntryHandler
  follow: boolean
  tail?: number
  since?: string
  resources: KubernetesResource[]
}

export interface LogEntryBase {
  msg: string
  timestamp?: Date
}

/**
 * Stream all logs for the given resources and service.
 */
export async function streamK8sLogs(params: GetAllLogsParams) {
  const api = await KubeApi.factory(params.log, params.ctx, params.provider)
  const entryConverter = makeDeployLogEntry(params.actionName)

  if (params.follow) {
    const logsFollower = new K8sLogFollower({ ...params, entryConverter, k8sApi: api, log: params.ctx.log })

    params.ctx.events.on("abort", () => {
      logsFollower.close()
      params.ctx.events.emit("done")
    })

    // We use sinceOnRetry 30s here, to cap the maximum age of log messages on retry attempts to max 30s
    // because we don't want to spam users with old log messages if they were running `garden logs` and then
    // disconnected for a long time, e.g. because the laptop was in sleep.
    await logsFollower.followLogs({ tail: params.tail, since: params.since, sinceOnRetry: "30s" })
  } else {
    const pods = await getAllPods(api, params.defaultNamespace, params.resources)
    let tail = params.tail
    if (!tail) {
      const containers = pods.flatMap((pod) => containerNamesForLogging(pod))
      tail = Math.floor(maxLogLinesInMemory / containers.length)

      params.log.debug(`Tail parameter not set explicitly. Setting to ${tail} to prevent log overflow.`)
    }
    const { onLogEntry } = params
    await Promise.all(
      pods.map(async (pod) => {
        const serviceLogEntries = await readLogs({ ...omit(params, "pods", "stream"), entryConverter, pod, tail, api })
        for (const entry of sortBy(serviceLogEntries, "timestamp")) {
          onLogEntry(entry)
        }
      })
    )
  }
  return {}
}

async function readLogs<T extends LogEntryBase>({
  api,
  entryConverter,
  tail,
  pod,
  defaultNamespace,
  since,
}: {
  api: KubeApi
  entryConverter: PodLogEntryConverter<T>
  tail?: number
  pod: KubernetesPod
  defaultNamespace: string
  since?: string
}): Promise<T[]> {
  const logs = await getPodLogs({
    api,
    namespace: pod.metadata?.namespace || defaultNamespace,
    pod,
    lineLimit: tail,
    timestamps: true,
    sinceSeconds: since ? parseDuration(since, "s") || undefined : undefined,
  })

  const allLines = logs.flatMap(({ containerName, log }) => {
    return log.split("\n").map((line) => {
      line = line.trimEnd()
      const res = { containerName }
      const { timestamp, msg } = parseTimestampAndMessage(line)
      return entryConverter({ ...res, timestamp, msg })
    })
  })

  return sortBy(allLines, "timestamp")
}

type ConnectionStatus = "connecting" | "connected" | "timed-out" | "error" | "closed"
const disconnectedStatuses: ConnectionStatus[] = ["timed-out", "error", "closed"]

interface LastLogEntries {
  messages: string[]
  timestamp: Date
}

interface LogConnection {
  pod: KubernetesPod
  containerName: string
  namespace: string
  status: ConnectionStatus
  shouldRetry: boolean
  abortController?: AbortController
  timeout?: NodeJS.Timeout

  // for reconnect & deduplication logic
  lastLogEntries?: LastLogEntries
  previousConnectionLastLogEntries?: LastLogEntries
}

interface LogOpts {
  tail?: number
  since?: string
  /**
   * Maximum age of logs to fetch on retry attempts.
   *
   * Can be useful in case you don't want to fetch the complete history of logs on retry attempts, for example when
   * we don't care about completeness, like in `garden logs --follow`.
   *
   * By default the LogFollower will try to fetch all the logs (unless the amount the app logged between retries exceeds
   * maxLogLinesInMemory).
   */
  sinceOnRetry?: string
}

const defaultRetryIntervalMs = 10000

/**
 * A helper class for following logs and managing the logs connections.
 *
 * The class operates kind of like a control loop, fetching the state of all pods for a given service at
 * an interval, comparing the result against current active connections and attempting re-connects as needed.
 */
export class K8sLogFollower<T extends LogEntryBase> {
  private connections: { [key: string]: LogConnection }
  private onLogEntry: (entry: T) => void
  private entryConverter: PodLogEntryConverter<T>
  private k8sApi: KubeApi
  private log: Log
  private defaultNamespace: string
  private resources: KubernetesResource<BaseResource>[]
  private timeoutId?: NodeJS.Timeout | null
  private resolve: ((val: unknown) => void) | null
  private retryIntervalMs: number

  constructor({
    onLogEntry,
    entryConverter,
    defaultNamespace,
    k8sApi,
    log,
    resources,
    retryIntervalMs = defaultRetryIntervalMs,
  }: {
    onLogEntry: (entry: T) => void
    entryConverter: PodLogEntryConverter<T>
    k8sApi: KubeApi
    log: Log
    defaultNamespace: string
    resources: KubernetesResource[]
    retryIntervalMs?: number
  }) {
    this.onLogEntry = onLogEntry
    this.entryConverter = entryConverter
    this.connections = {}
    this.k8sApi = k8sApi
    this.log = log
    this.defaultNamespace = defaultNamespace
    this.resources = resources
    this.resolve = null
    this.retryIntervalMs = retryIntervalMs
  }

  /**
   * Start following logs. This function doesn't return and simply keeps running
   * until outside code calls the close method.
   */
  public async followLogs(opts: LogOpts) {
    // make sure that createConnections is never called concurrently (wait for it to finish, then wait retryIntervalMs)
    const followLoop = async () => {
      try {
        await this.createConnections(opts)
      } finally {
        // if timeoutId is null, close() has been called and we should stop the loop.
        if (this.timeoutId !== null) {
          this.timeoutId = setTimeout(followLoop, this.retryIntervalMs)
        }
      }
    }

    await followLoop()

    return new Promise((resolve, _reject) => {
      this.resolve = resolve
    })
  }

  /**
   * Cleans up all active network requests and resolves the promise that was created when the logs following
   * was started.
   */
  public close() {
    this.clearConnections()
    if (this.resolve) {
      this.resolve({})
    }
  }

  /**
   * Same as `close`, but also fetches the last several seconds of logs and streams any missing entries
   * (in case any were missing).
   */
  public async closeAndFlush() {
    await this.flushFinalLogs()
    this.close()
  }

  private clearConnections() {
    const conns = Object.values(this.connections)
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    conns.forEach((conn) => {
      try {
        conn.abortController?.abort()
      } catch {}
    })
  }

  private async flushFinalLogs() {
    this.log.debug("flushFinalLogs called...")

    // wait max 20 seconds
    for (let i = 0; i < 20; i++) {
      const allConnections = Object.values(this.connections)

      if (allConnections.length === 0) {
        this.log.debug("flushFinalLogs: unexpectedly encountered empty list of connections")
      }

      if (allConnections.every((c) => c.status === "closed" && c.shouldRetry === false)) {
        this.log.debug("flushFinalLogs: all connections were finished. Success!")
        return
      }
      await sleep(1000)
    }

    this.log.warn(
      "Failed to finish streaming logs: Timed out after 20 seconds. Some logs might be missing in the verbose log output, or in Garden Cloud."
    )
  }

  private async handleConnectionClose(connection: LogConnection, status: ConnectionStatus, error: unknown) {
    clearTimeout(connection.timeout)

    const prevStatus = connection.status
    connection.status = status
    connection.previousConnectionLastLogEntries = connection.lastLogEntries

    const description = `container '${connection.containerName}' in Pod '${connection.pod.metadata.name}`

    // There's no need to log the closed event that happens after an error event
    // Also no need to log the error event after a timed-out event
    if (!(prevStatus === "error" && status === "closed") && !(prevStatus === "timed-out" && status === "error")) {
      let reason = error
      if (error instanceof KubernetesError) {
        reason = `HTTP request failed with status ${error.code}`
      }
      this.log.silly(() => `<Lost connection to ${description}. Reason: ${reason}>`)
    }

    /**
     * Helper to stop retrying a connection.
     *
     * This means that we won't fetch logs again from this container, but createConnections will still
     * be called and thus we will still notice when new Pods are added to the Deployment, for example when
     * the user runs `garden deploy`.
     */
    const stopRetrying = (why: string) => {
      this.log.silly(() => `<Will stop retrying connecting to ${description}. Reason: ${why}>`)
      connection.shouldRetry = false
    }

    try {
      const pod = await this.k8sApi.core.readNamespacedPodStatus({
        name: connection.pod.metadata.name,
        namespace: connection.namespace,
      })

      // we want to retry anyway if fetching logs failed recently
      const wasError = prevStatus === "error" || status === "error"

      // Check if Pod phase is terminal. If so, there is no reason to keep looking for new logs.
      // See phases https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-phase
      const phase = pod.status.phase || "Unknown"
      if (["Succeeded", "Failed"].includes(phase) && !wasError) {
        stopRetrying(`The Pod phase is terminal (${phase})`)
      } else {
        this.log.silly(() => `<Will retry connecting to ${description}. Reason: The Pod phase is still ${phase}>`)
      }
    } catch (e) {
      if (e instanceof KubernetesError) {
        this.log.silly(() => `<Encountered error while fetching Pod status for ${description}. Reason: ${e.message}>`)
        // retry once if the pod status query returned 404
        if (e.responseStatusCode === 404 && prevStatus === "error") {
          stopRetrying("The pod or the namespace does not exist")
        }
      } else {
        throw e
      }
    }
  }

  private async createConnections({ tail, since, sinceOnRetry }: LogOpts) {
    let pods: KubernetesPod[]

    try {
      pods = await getAllPods(this.k8sApi, this.defaultNamespace, this.resources)
    } catch (err) {
      // Log the error and keep trying.
      this.log.debug(`<Getting pods failed with error: ${err}>`)
      return
    }
    const containers = pods.flatMap((pod) => {
      return containerNamesForLogging(pod).map((containerName) => ({
        pod,
        containerName,
      }))
    })

    if (containers.length === 0) {
      this.log.debug(
        `<No running containers found for ${summarize(this.resources)}. Will retry in ${
          this.retryIntervalMs / 1000
        }s...>`
      )
    }

    await Promise.all(
      containers.map(async ({ pod, containerName }) => {
        const connection = this.createConnectionIfMissing(pod, containerName)

        if (disconnectedStatuses.includes(connection.status) && connection.shouldRetry) {
          // The connection has been registered but is not active
          this.log.silly(
            `<Connecting to container ${connection.containerName} in Pod ${connection.pod.metadata.name}, because current connection status is ${connection.status}>`
          )
          connection.status = "connecting"
        } else {
          // nothing to do
          return
        }

        let abortController: AbortController

        const makeTimeout = () => {
          const idleTimeout = 60000
          return setTimeout(async () => {
            await this.handleConnectionClose(
              connection,
              "timed-out",
              `Connection has been idle for ${idleTimeout / 1000} seconds.`
            )
            abortController?.abort()
          }, idleTimeout)
        }

        // The ts-stream library that we use for service logs entries doesn't properly implement
        // a writeable stream which the K8s API expects so we wrap it here.
        const writableStream = new Writable({
          write: (chunk: Buffer | undefined, _encoding: BufferEncoding, next) => {
            // clear the timeout, as we have activity on the socket
            clearTimeout(connection.timeout)
            connection.timeout = makeTimeout()

            // we do not use the encoding parameter, because it is invalid
            // we can assume that we receive utf-8 encoded strings from k8s
            const line = chunk?.toString()?.trimEnd()

            if (!line) {
              next()
              return
            }

            const { timestamp, msg } = parseTimestampAndMessage(line)

            // If we can't parse the timestamp, we encountered a kubernetes error
            if (!timestamp) {
              this.log.debug(
                `Encountered a log message without timestamp. This is probably an error message from the Kubernetes API: ${line}`
              )
            } else if (this.isDuplicate({ connection, timestamp, msg })) {
              this.log.silly(() => `Dropping duplicate log message: ${line}`)
            } else {
              this.updateLastLogEntries({ connection, timestamp, msg })
              this.handleLogEntry({
                msg,
                containerName,
                timestamp,
              })
            }

            next()
          },
        })

        const context = `Follow logs of '${containerName}' in Pod '${pod.metadata.name}'`

        try {
          abortController = await this.streamPodLogs({
            connection,
            stream: writableStream,
            tail: tail || Math.floor(maxLogLinesInMemory / containers.length),
            since,
            sinceOnRetry,
          })
          this.log.silly(() => `<Connected to container '${containerName}' in Pod '${pod.metadata.name}'>`)
        } catch (err) {
          await this.handleConnectionClose(connection, "error", toKubernetesError(err, context))
          return
        }
        connection.abortController = abortController
        connection.status = "connected"
        connection.timeout = makeTimeout()

        writableStream.on(
          "error",
          async (error) => await this.handleConnectionClose(connection, "error", toKubernetesError(error, context))
        )
        writableStream.on("close", async () => await this.handleConnectionClose(connection, "closed", "Request closed"))
        writableStream.on("error", async () => await this.handleConnectionClose(connection, "error", "Request closed"))
      })
    )
  }

  private async streamPodLogs({
    connection,
    stream,
    tail,
    since,
    sinceOnRetry,
  }: {
    connection: LogConnection
    stream: Writable
    tail: number
    since?: string
    sinceOnRetry?: string
  }) {
    const opts = {
      follow: true, // only works with follow true, as we receive chunks with multiple messages in the stream otherwise
      pretty: false,
      previous: false,
      timestamps: true,
      tailLines: tail,
    }

    // Get timestamp of last seen message from previous connection attempt, and only fetch logs since this time.
    // This is because we've already streamed all the previous logs. This helps avoid unnecessary data transfer.
    const sinceTime = connection.lastLogEntries?.timestamp.toISOString()

    // If this is a retry attempt and the sinceOnRetry parameter is set, we don't want to fetch old logs
    if (sinceTime && sinceOnRetry) {
      opts["sinceSeconds"] = parseDuration(sinceOnRetry, "s") || undefined
    }

    // This is a retry attempt
    else if (sinceTime) {
      opts["sinceTime"] = sinceTime
    }

    // If this is not a retry attempt and the since parameter has been set
    else if (since) {
      opts["sinceSeconds"] = parseDuration(since, "s") || undefined
    }

    return this.k8sApi
      .getLogger()
      .log(connection.namespace, connection.pod.metadata.name, connection.containerName, stream, opts)
  }

  private createConnectionIfMissing(pod: KubernetesPod, containerName: string): LogConnection {
    const connectionId = `${pod.metadata.name}-${containerName}`

    if (this.connections[connectionId] === undefined) {
      this.connections[connectionId] = {
        namespace: pod.metadata.namespace || this.defaultNamespace,
        pod,
        containerName,
        status: "closed",
        shouldRetry: true,
      }
    }

    return this.connections[connectionId]
  }

  /**
   * Returns `true` if the message is considered a duplicate, and `false` if otherwise.
   *
   * This works by comparing the message timestamp with the lastLogEntries of the previous connection attempt
   * (`connection.previousConnectionLastLogEntries`), and if the timestamp is equal by comparing the messages
   * themselves.
   */
  private isDuplicate({
    connection,
    timestamp,
    msg,
  }: {
    connection: LogConnection
    timestamp: Date
    msg: string
  }): boolean {
    // get last messages from previous connection attempt
    const beforeReconnect = connection.previousConnectionLastLogEntries

    if (!beforeReconnect) {
      // This can't be a duplicate, because this is not a reconnect attempt
      return false
    }

    // lastMessages is an Array, because there might be multiple messages for a given time stamp.
    const lastMessages = beforeReconnect.messages
    const lastTime = beforeReconnect.timestamp.getTime()

    const time = timestamp.getTime()

    // message is a duplicate because we've seen a more recent message in the previous connection already
    if (time < lastTime) {
      return true
    }

    // This message is a duplicate if we've seen it in the previous connection already
    if (time === lastTime) {
      return lastMessages.includes(msg)
    }

    // This message has a more recent timestamp than the last message seen in the previous connection
    return false
  }

  /**
   * Maintains `connection.lastLogEntries`
   *
   * This method makes sure that the `lastLogEntries` of the `connection` always contains
   * the log messages with the most recently seen timestamp.
   */
  private updateLastLogEntries({
    connection,
    timestamp,
    msg,
  }: {
    connection: LogConnection
    timestamp: Date
    msg: string
  }) {
    const time = timestamp.getTime()
    const lastTime = connection.lastLogEntries?.timestamp.getTime()

    if (!connection.lastLogEntries || time !== lastTime) {
      connection.lastLogEntries = { messages: [msg], timestamp }
    } else {
      // we got another message for the same timestamp
      connection.lastLogEntries.messages.push(msg)
    }
  }

  private handleLogEntry({
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
    const logEntry = this.entryConverter({
      timestamp,
      msg,
      level,
      containerName,
    })
    this.onLogEntry(logEntry)
  }
}

export interface PodLogEntryConverterParams {
  msg: string
  containerName?: string
  level?: LogLevel
  timestamp?: Date
}

function parseTimestampAndMessage(line: string): { msg: string; timestamp?: Date } {
  let timestamp: Date | null = null
  // Fallback to printing the full line if we can't parse the timestamp
  let msg = line
  try {
    const parts = splitFirst(line, " ")
    const dateInstance = new Date(parts[0])
    if (isValidDateInstance(dateInstance)) {
      timestamp = dateInstance
    }
    msg = parts[1]
  } catch {}
  return timestamp ? { msg, timestamp } : { msg }
}

/**
 * Returns a list of container names from which to fetch logs. Ignores sidecar containers injected by Garden.
 */
function containerNamesForLogging(pod: KubernetesPod): string[] {
  return pod.spec!.containers.map((c) => c.name).filter((n) => !n.match(/^garden-/))
}

export type PodLogEntryConverter<T extends LogEntryBase> = (p: PodLogEntryConverterParams) => T

export const makeDeployLogEntry: (deployName: string) => PodLogEntryConverter<DeployLogEntry> = (deployName) => {
  return ({ timestamp, msg, level, containerName }: PodLogEntryConverterParams) => ({
    name: deployName,
    timestamp,
    msg,
    level,
    tags: {
      container: containerName || "",
    },
  })
}
