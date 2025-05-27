/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { timestampFromDate } from "@bufbuild/protobuf/wkt"
import type { ULID } from "ulid"
import { monotonicFactory, ulid } from "ulid"
import type { GardenWithNewBackend } from "../../garden.js"
import { registerCleanupFunction, sleep } from "../../util/util.js"
import type { Log } from "../../logger/log-entry.js"
import type { EventName, EventPayload, GardenEventAnyListener } from "../../events/events.js"
import { LogLevel } from "../../logger/logger.js"
import type { LogEntryEventPayload } from "../buffered-event-stream.js"
import type {
  Event as GrpcEventEnvelope,
  Event_GardenEvent as GrpcGardenEvent,
  GardenEventIngestionService,
  EventResponse,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import {
  Event_GardenEventSchema,
  EventResponse_Message_Severity,
  EventSchema,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import { create } from "@bufbuild/protobuf"
import { ConnectError, type Client } from "@connectrpc/connect"
import type { WritableIterable } from "@connectrpc/connect/protocol"
import { createWritableIterable } from "@connectrpc/connect/protocol"
import {
  GardenCommandExecutionStarted_InvocationSchema,
  GardenCommandExecutionStartedSchema,
  GardenCommandExecutionStarted_Invocation_InstructionSchema,
  GardenCommandExecutionStarted_GitMetadataSchema,
  GardenCommandExecutionStarted_ProjectMetadataSchema,
  GardenCommandExecutionStarted_GitMetadata_GitRemoteSchema,
  GardenCommandExecutionCompletedSchema,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/garden-command/garden-command_pb.js"
import { GrowCloudError } from "./api.js"

const nextEventUlid = monotonicFactory()

export class GrowBufferedEventStream {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly eventListener: GardenEventAnyListener<EventName>
  private readonly logListener: GardenEventAnyListener<"logEntry">

  private readonly shouldStreamLogEntries: boolean

  private readonly eventIngestionService: Client<typeof GardenEventIngestionService>

  /**
   * Maps a globally _monotonic_ ULID (event ID) to the corresponding event's payload.
   */
  private readonly eventBuffer = new Map<ULID, GrpcEventEnvelope>()

  private outputStream: WritableIterable<GrpcEventEnvelope> | undefined
  private isClosed: boolean
  private readonly closeCallbacks: (() => void)[] = []

  private readonly sessionIdToUlidMap = new Map<string, ULID>()

  constructor({
    garden,
    log,
    eventIngestionService,
    shouldStreamLogEntries,
  }: {
    garden: GardenWithNewBackend
    log: Log
    eventIngestionService: Client<typeof GardenEventIngestionService>
    shouldStreamLogEntries: boolean
  }) {
    this.garden = garden
    this.log = log
    this.eventIngestionService = eventIngestionService
    this.isClosed = false
    this.shouldStreamLogEntries = shouldStreamLogEntries

    // TODO: make sure it waits for the callback function completion
    registerCleanupFunction("grow-stream-session-cancelled-event", () => {
      if (this.isClosed) {
        return
      }

      this.handleEvent("sessionCancelled", {})
      this.close().catch(() => {})
    })

    this.logListener = (name, payload) => {
      if (name === "logEntry" && payload.level <= LogLevel.debug) {
        this.handleLogEntry(payload)
      }
    }
    this.log.root.events.onAny(this.logListener)

    this.eventListener = async (name, payload) => {
      this.handleEvent(name, payload)
    }
    this.garden.events.onAny(this.eventListener)

    setTimeout(async () => {
      this.log.silly("GrowBufferedEventStream: Starting loop")

      while (!this.isClosed) {
        this.log.silly("GrowBufferedEventStream: Connecting ...")

        try {
          await this.streamEvents()
        } catch (err) {
          if (err instanceof ConnectError) {
            this.log.silly(`GrowBufferedEventStream: Error while streaming events: ${err}`)
            this.log.silly("GrowBufferedEventStream: Retrying in 1 second...")
            await sleep(1000)
          } else {
            // This is a temporary workaround to avoid crashing the process when the new event system is not in production.
            // In production, we want to crash the process to surface the issue.
            this.log.debug(`GrowBufferedEventStream: Unexpected error while streaming events: ${err}`)
            this.log.debug("GrowBufferedEventStream: Bailing out.")
            break
            // TODO(production): remove the code above and uncomment the following.
            // This will become an unhandled error and will cause the process to crash.
            // throw err
          }
        }
      }
    }, 0)
  }

  async close() {
    if (this.isClosed) {
      return
    }

    this.garden.events.offAny(this.eventListener)
    this.log.root.events.offAny(this.logListener)

    if (this.eventBuffer.size === 0) {
      this.log.silly(
        "GrowBufferedEventStream: Close called and no events waiting for acknowledgement. Disconnecting..."
      )
      this.isClosed = true
      // close the connection as well
      this.outputStream?.close()
      return
    }

    // there are still events in the buffer, we need to wait for them to be acknowledged
    const promise = new Promise<void>((resolve) => {
      this.closeCallbacks.push(resolve)
    })

    // TODO(production): use 30 seconds when we go to production, but for now let's only wait 100ms for acknowledgements.
    const timeout = 100
    // wait max 10 seconds for the events to be acknowledged
    // const timeout = 30000

    await Promise.race([
      promise,
      (async () => {
        await sleep(timeout)
        // TODO(production): use warn loglevel instead of debug for this one
        this.log.debug(
          `Not all events were acknowledged within ${timeout / 1000} seconds. Information in Garden Cloud may be incomplete.`
        )
      })(),
    ])

    this.isClosed = true
    this.outputStream?.close()
  }

  /**
   * Maps a legacy {@code sessionId} value to a valid ULID.
   *
   * The mapping persists in the {@link #sessionIdToUlidMap}
   * until it's explicitly evicted via {@link #eraseSessionUlid}.
   */
  private getSessionUlid(sessionId: string): ULID {
    const existingSessionUlid = this.sessionIdToUlidMap.get(sessionId)
    if (!!existingSessionUlid) {
      return existingSessionUlid
    }

    const generatedSessionUlid = ulid()
    this.sessionIdToUlidMap.set(sessionId, generatedSessionUlid)
    this.log.silly(() => `Mapped sessionId=${sessionId} to ulid=${generatedSessionUlid}`)
    return generatedSessionUlid
  }

  private handleEvent<T extends EventName>(name: T, payload: EventPayload<T>) {
    // Use the parent session ID of the event payload,
    // if not available session ID of the event payload ID,
    // if not available use the garden session ID.
    // This means outside `garden dev` and `garden serve,
    // the session ID will always be the same as the command ID (As we're using the session ID as command ID).
    const coreParentSessionId =
      payload.$context?._parentSessionId || payload.$context?.sessionId || this.garden.sessionId

    // Translate sessionId from UUID to ULID, because event payloads require it to be ULID
    const sessionUlid = this.getSessionUlid(coreParentSessionId)

    const event = create(Event_GardenEventSchema, {
      organizationId: this.garden.cloudApiV2.organizationId,
      sessionUlid,
      clientVersion: this.garden.version,
      // actor id will be filled in by the backend
      // actual event payload will be filled in later
    })

    const envelope: GrpcEventEnvelope = create(EventSchema, {
      eventUlid: nextEventUlid(),
      eventData: {
        case: "garden",
        value: event,
      },
    })

    if (name === "commandInfo") {
      this.handleCommandStarted({ sessionId: sessionUlid, event, payload: payload as EventPayload<"commandInfo"> })
    }
    if (name === "sessionCompleted") {
      this.handleCommandCompleted({
        sessionId: sessionUlid,
        event,
        payload: payload as EventPayload<"sessionCompleted">,
      })
    }
    if (name === "sessionFailed") {
      this.handleCommandFailed({ sessionId: sessionUlid, event, payload: payload as EventPayload<"sessionFailed"> })
    }

    if (event.eventData.value === undefined) {
      this.log.silly(`GrowBufferedEventStream: Ignoring event ${name} (ulid=${envelope.eventUlid})`)
      return
    }

    this.log.silly(
      () =>
        `GrowBufferedEventStream: ${this.outputStream ? "Sending" : "Buffering"} event ${event.eventData.case} (ulid=${envelope.eventUlid})`
    )
    this.log.silly(
      () => `GrowBufferedEventStream: ${JSON.stringify(envelope, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`
    )

    this.eventBuffer.set(envelope.eventUlid, envelope)

    // NOTE: we don't need to wait for the promise to resolve.
    // If sending the event fails, it will be retried as it lives in the event buffer.
    // See the caller of `streamEvents`.
    void this.outputStream?.write(envelope).catch((_) => undefined)
  }

  private handleCommandCompleted({
    sessionId,
    event,
  }: {
    sessionId: string
    event: GrpcGardenEvent
    payload: EventPayload<"sessionCompleted">
  }) {
    const commandId = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
        commandId,

        // completed now
        completedAt: timestampFromDate(new Date()),
        success: true,
      }),
    }
  }

  private handleCommandFailed({
    sessionId,
    event,
  }: {
    sessionId: string
    event: GrpcGardenEvent
    payload: EventPayload<"sessionFailed">
  }) {
    const commandId = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
        commandId,

        // completed now
        completedAt: timestampFromDate(new Date()),
        success: false,
      }),
    }
  }

  private handleCommandStarted({
    sessionId,
    event,
    payload,
  }: {
    sessionId: string
    event: GrpcGardenEvent
    payload: EventPayload<"commandInfo">
  }) {
    const commandUlid = this.getSessionUlid(sessionId)

    event.eventData = {
      case: "commandExecutionStarted",
      value: create(GardenCommandExecutionStartedSchema, {
        commandUlid,

        // started now
        startedAt: timestampFromDate(new Date()),

        isCustomCommand: payload.isCustomCommand,

        invocation: create(GardenCommandExecutionStarted_InvocationSchema, {
          cwd: process.cwd(),
          instruction: create(GardenCommandExecutionStarted_Invocation_InstructionSchema, {
            name: payload.name,
            args: payload.rawArgs,
          }),
        }),

        gitMetadata: create(GardenCommandExecutionStarted_GitMetadataSchema, {
          repositoryRootDir: payload._vcsRepositoryRootDirAbs,
          headRefSha: payload.vcsCommitHash,

          // NOTE: this will be the word HEAD when HEAD is detached, otherwise the branch name.
          headRefName: payload.vcsBranch,

          // TODO: expose all remotes with their original names
          gitRemotes: payload.vcsOriginUrl
            ? [
                create(GardenCommandExecutionStarted_GitMetadata_GitRemoteSchema, {
                  name: "origin",
                  url: payload.vcsOriginUrl,
                }),
              ]
            : [],
        }),

        projectMetadata: create(GardenCommandExecutionStarted_ProjectMetadataSchema, {
          projectName: payload.projectName,
          projectApiVersion: payload._projectApiVersion,
          projectRootDir: payload._projectRootDirAbs,

          // @ts-expect-error FIXME: add namespaceName to grpc schema
          namespaceName: payload.namespaceName,
          environmentName: payload.environmentName,

          // NOTE: these only exist with the old backend at the moment
          // namespaceId: payload.namespaceId,
          // environmentId: payload.environmentId,
        }),
      }),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleLogEntry(logEntry: LogEntryEventPayload) {
    if (!this.shouldStreamLogEntries) {
      return
    }
    // TODO: logs handling
  }

  private async streamEvents() {
    this.outputStream = createWritableIterable<GrpcEventEnvelope>()

    const ackStream = this.eventIngestionService.ingestEvents(this.outputStream)

    this.log.silly(() => "GrowBufferedEventStream: Connected")

    // we synchronously flush all events into the output stream, to ensure that we don't send events out-of-order
    this.flushEventBuffer()

    try {
      await this.consumeAcks(ackStream)
    } finally {
      this.outputStream?.close()
      this.outputStream = undefined
    }
  }

  private async consumeAcks(ackStream: AsyncIterable<EventResponse>) {
    for await (const nextAck of ackStream) {
      if (!nextAck.success) {
        this.log.silly(
          `GrowBufferedEventStream: Server failed to process event with ulid=${nextAck.eventUlid}, final=${nextAck.final}`
        )
      } else {
        // Remove acknowledged event from the buffer
        this.log.silly(
          () => `GrowBufferedEventStream: Received ack for event ${nextAck.eventUlid}, final=${nextAck.final}`
        )
      }

      const messages = nextAck.messages || []
      for (const msg of messages) {
        const logMessage = `${this.garden.cloudApiV2.distroName} failed to process event ulid=${nextAck.eventUlid}: ${msg.text}`

        switch (msg.severity) {
          case EventResponse_Message_Severity.DEBUG:
            this.log.debug(logMessage)
            break
          case EventResponse_Message_Severity.INFO:
            this.log.info(logMessage)
            break
          case EventResponse_Message_Severity.WARNING:
            this.log.warn(logMessage)
            break
          case EventResponse_Message_Severity.ERROR:
            throw new GrowCloudError({
              message: logMessage,
            })
          default:
            this.log.silly(`GrowBufferedEventStream: Unknown message severity ${msg.severity}: ${msg.text}`)
        }
      }

      if (nextAck.success || nextAck.final) {
        this.eventBuffer.delete(nextAck.eventUlid)
      }

      if (this.closeCallbacks.length && this.eventBuffer.size === 0) {
        this.log.silly("GrowBufferedEventStream: All events have been acknowledged. Disconnecting...")
        for (const callback of this.closeCallbacks) {
          // Call all the callbacks to notify that the stream is closed
          callback()
        }
        this.closeCallbacks.length = 0
        break
      }
    }
  }

  /**
   * Flushes the event buffer to the output stream.
   * We do this in synchronous fashion (without waiting for the event to be consumed) to avoid
   * out-of-order events, if we receive new events while we're still flushing.
   */
  private flushEventBuffer() {
    if (this.eventBuffer.size === 0) {
      return
    }

    this.log.silly(() => `GrowBufferedEventStream: Flushing ${this.eventBuffer.size} events from the buffer`)
    // NOTE: The Map implementation in the javascript runtime guarantees that values will be iterated in the order they were added (FIFO).
    for (const event of this.eventBuffer.values()) {
      if (!this.outputStream) {
        this.log.silly(() => `GrowBufferedEventStream: Stream closed during flush`)
        break
      }
      // NOTE: we're not waiting for the promise to resolve on purpose, as we want to synchronously flush all events
      // to the underlying queue avoiding out-of-order event transmission.
      void this.outputStream.write(event).catch((_) => undefined)
    }
  }
}
