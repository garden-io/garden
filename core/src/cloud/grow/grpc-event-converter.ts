/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { Event_GardenEvent } from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import {
  Event_GardenEventSchema,
  EventSchema,
  type Event as GrpcEventEnvelope,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/events_pb.js"
import type { EventName as CoreEventName, EventPayload as CoreEventPayload } from "../../events/events.js"
import type { GardenWithNewBackend } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import { monotonicFactory, ulid, type ULID, type UUID } from "ulid"
import { create } from "@bufbuild/protobuf"
import {
  GardenCommandExecutionCompletedSchema,
  GardenCommandExecutionStarted_GitMetadata_GitRemoteSchema,
  GardenCommandExecutionStarted_GitMetadataSchema,
  GardenCommandExecutionStarted_Invocation_InstructionSchema,
  GardenCommandExecutionStarted_InvocationSchema,
  GardenCommandExecutionStarted_ProjectMetadataSchema,
  GardenCommandExecutionStartedSchema,
} from "@buf/garden_grow-platform.bufbuild_es/public/events/garden-command/garden-command_pb.js"
import { timestampFromDate } from "@bufbuild/protobuf/wkt"

const nextEventUlid = monotonicFactory()

type GardenEventContext = {
  sessionUlid: ULID
  commandUlid: ULID
  organizationId: string
  clientVersion: string
}

export class GrpcEventConverter {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  private readonly uuidToUlidMap = new Map<UUID, ULID>()

  constructor(garden: GardenWithNewBackend, log: Log) {
    this.garden = garden
    this.log = log
  }

  convert<T extends CoreEventName>(name: T, payload: CoreEventPayload<T>): GrpcEventEnvelope[] {
    const context = this.getGardenEventContext(payload)

    const events: GrpcEventEnvelope[] = []

    switch (name) {
      case "commandInfo":
        events.push(...this.handleCommandStarted({ context, payload: payload as CoreEventPayload<"commandInfo"> }))
        break
      case "sessionCompleted":
        events.push(
          ...this.handleCommandCompleted({
            context,
            payload: payload as CoreEventPayload<"sessionCompleted">,
          })
        )
        break

      case "sessionFailed":
        events.push(...this.handleCommandFailed({ context, payload: payload as CoreEventPayload<"sessionFailed"> }))
        break
      default:
        // TODO: handle all event cases
        // name satisfies never // ensure all cases are handled
        this.log.silly(`GrpcEventStream: Unhandled core event ${name}`)
    }

    if (events.length === 0) {
      this.log.silly(`GrpcEventStream: Ignoring core event ${name}`)
    }

    return events
  }

  private handleCommandCompleted({
    context,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"sessionCompleted">
  }): GrpcEventEnvelope[] {
    const event = createGardenEvent(context, {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
        commandUlid: context.commandUlid,

        // completed now
        completedAt: timestampFromDate(new Date()),
        success: true,
      }),
    })
    return [event]
  }

  private handleCommandFailed({
    context,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"sessionFailed">
  }): GrpcEventEnvelope[] {
    const event = createGardenEvent(context, {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
        commandUlid: context.commandUlid,

        // completed now
        completedAt: timestampFromDate(new Date()),
        success: false,
      }),
    })
    return [event]
  }

  private handleCommandStarted({
    context,
    payload,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"commandInfo">
  }): GrpcEventEnvelope[] {
    const event = createGardenEvent(context, {
      case: "commandExecutionStarted",
      value: create(GardenCommandExecutionStartedSchema, {
        commandUlid: context.commandUlid,

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
    })

    return [event]
  }

  private getGardenEventContext(payload: CoreEventPayload): GardenEventContext {
    // Get core parent session ID:
    // Use the parent session ID of the event payload, if not available use the session ID of the event payload, if not available use the garden session ID.
    const coreParentSessionId =
      payload.$context?._parentSessionId || payload.$context?.sessionId || this.garden.sessionId

    // In the GRPC schema, we call this just the session ID.
    const sessionUlid = this.mapToUlid(coreParentSessionId, "parentSessionId", "sessionUlid")

    // Get the core session ID:
    // Use the session ID of the event payload, if not available use the garden session ID.
    const coreSessionId = payload.$context?.sessionId || this.garden.sessionId

    const commandUlid = this.mapToUlid(coreSessionId, "sessionId", "commandUlid")

    return {
      clientVersion: this.garden.version,
      organizationId: this.garden.cloudApiV2.organizationId,
      sessionUlid,
      commandUlid,
    }
  }

  /**
   * Maps a legacy {@code UUID} value to a valid ULID.
   *
   * The mapping persists in the {@link #sessionIdToUlidMap}.
   */
  private mapToUlid(uuid: UUID, fromDescription: string, toDescription: string): ULID {
    const existingSessionUlid = this.uuidToUlidMap.get(uuid)
    if (!!existingSessionUlid) {
      return existingSessionUlid
    }

    const generatedUlid = ulid()
    this.uuidToUlidMap.set(uuid, generatedUlid)
    this.log.silly(() => `GrpcEventConverter: Mapped ${fromDescription}=${uuid} to ${toDescription}=${generatedUlid}`)
    return generatedUlid
  }
}

export function createGardenEvent(
  context: GardenEventContext,
  eventData: Event_GardenEvent["eventData"]
): GrpcEventEnvelope {
  const event = create(Event_GardenEventSchema, {
    organizationId: context.organizationId,
    sessionUlid: context.sessionUlid,
    clientVersion: context.clientVersion,
    // actor id will be filled in by the backend
    eventData,
  })

  const envelope: GrpcEventEnvelope = create(EventSchema, {
    eventUlid: nextEventUlid(),
    eventData: {
      case: "garden",
      value: event,
    },
  })

  return envelope
}

export function describeGrpcEvent(event: GrpcEventEnvelope): string {
  return `GrpcEvent(${event.eventUlid}, ${event.eventData.case}, ${event.eventData.value?.eventData.case})`
}
