/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { GardenCliEvent } from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import {
  GardenCliEventSchema,
  EventSchema,
  type Event as GrpcEventEnvelope,
  EventType,
  GardenCliEventType,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/events_pb.js"
import type { EventName as CoreEventName, EventPayload as CoreEventPayload } from "../../events/events.js"
import type { GardenWithNewBackend } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import { monotonicFactory, ulid, type ULID, type UUID } from "ulid"
import { create } from "@bufbuild/protobuf"
import {
  AecAgentStatusSchema,
  AecEnvironmentUpdateSchema,
  AecAgentStatusType,
  AecAction,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/garden_aec_pb.js"
import {
  GardenCommandExecutionCompletedSchema,
  GardenCommandExecutionStarted_GitMetadata_GitRemoteSchema,
  GardenCommandExecutionStarted_GitMetadataSchema,
  GardenCommandExecutionStarted_Invocation_InstructionSchema,
  GardenCommandExecutionStarted_InvocationSchema,
  GardenCommandExecutionStarted_ProjectMetadataSchema,
  GardenCommandExecutionStartedSchema,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/garden_command_pb.js"
import { timestampFromDate } from "@bufbuild/protobuf/wkt"
import type { DeployRunResult } from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/garden_action_pb.js"
import {
  GardenActionGetStatusCompletedSchema,
  GardenActionGetStatusStartedSchema,
  GardenActionRefSchema,
  GardenActionResolvedGraph_DependencySchema,
  GardenActionResolvedGraphSchema,
  GardenActionRunCompletedSchema,
  GardenActionRunStartedSchema,
  GardenActionScannedSchema,
  ServiceIngressSchema,
  DeployRunResultSchema,
} from "@buf/garden_grow-platform.bufbuild_es/garden/public/events/v1/garden_action_pb.js"
import type { DeployStatusForEventPayload } from "../../types/service.js"

const nextEventUlid = monotonicFactory()

type GardenEventContext = {
  sessionUlid: ULID
  commandUlid: ULID
  organizationId: string
  clientVersion: string
}

const aecAgentStatusMap = {
  running: AecAgentStatusType.RUNNING,
  stopped: AecAgentStatusType.STOPPED,
  error: AecAgentStatusType.ERROR,
}

const aecEnvironmentUpdateActionTriggeredMap = {
  pause: AecAction.PAUSE,
  cleanup: AecAction.CLEANUP,
}

export class GrpcEventConverter {
  private readonly garden: GardenWithNewBackend
  private readonly log: Log

  /**
   * It is important to keep it static,
   * because each command execution in the dev console causes a new instance creation.
   * We need to be sure that uuid to ulid mapping is stable is the case if we have a cache miss here.
   */
  private static readonly uuidToUlidMap = new Map<UUID, ULID>()

  constructor(garden: GardenWithNewBackend, log: Log) {
    this.garden = garden
    this.log = log
  }

  convert<T extends CoreEventName>(name: T, payload: CoreEventPayload<T>): GrpcEventEnvelope[] {
    const context = this.getGardenEventContext(payload)

    let events: GrpcEventEnvelope[] | undefined

    switch (name) {
      case "commandInfo":
        events = this.handleCommandStarted({ context, payload: payload as CoreEventPayload<"commandInfo"> })
        break
      case "sessionCompleted":
        events = this.handleCommandCompleted({
          context,
          payload: payload as CoreEventPayload<"sessionCompleted">,
        })
        break
      case "sessionFailed":
        events = this.handleCommandFailed({ context, payload: payload as CoreEventPayload<"sessionFailed"> })
        break
      case "configGraph":
        events = this.handleConfigGraph({ context, payload: payload as CoreEventPayload<"configGraph"> })
        break
      case "buildStatus":
      case "testStatus":
      case "deployStatus":
      case "runStatus":
        events = this.handleActionStatus({
          context,
          payload: payload as
            | CoreEventPayload<"buildStatus">
            | CoreEventPayload<"testStatus">
            | CoreEventPayload<"deployStatus">
            | CoreEventPayload<"runStatus">,
        })
        break
      case "aecAgentEnvironmentUpdate":
        events = this.handleAecEnvironmentUpdate({
          context,
          payload: payload as CoreEventPayload<"aecAgentEnvironmentUpdate">,
        })
        break
      case "aecAgentStatus":
        events = this.handleAecAgentStatus({
          context,
          payload: payload as CoreEventPayload<"aecAgentStatus">,
        })
        break
      default:
        // TODO: handle all event cases
        // name satisfies never // ensure all cases are handled
        this.log.silly(`GrpcEventStream: Unhandled core event ${name}`)
        return []
    }

    if (events.length === 0) {
      this.log.silly(`GrpcEventStream: Ignoring core event ${name}`)
    }

    return events
  }

  private handleAecEnvironmentUpdate({
    context,
    payload,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"aecAgentEnvironmentUpdate">
  }): GrpcEventEnvelope[] {
    return [
      createGardenCliEvent(context, GardenCliEventType.AEC_ENVIRONMENT_UPDATE, {
        case: "aecEnvironmentUpdate",
        value: create(AecEnvironmentUpdateSchema, {
          aecAgentInfo: payload.aecAgentInfo,
          projectId: payload.projectId,
          timestamp: timestampFromDate(new Date(payload.timestamp)),
          actionTriggered: payload.actionTriggered
            ? aecEnvironmentUpdateActionTriggeredMap[payload.actionTriggered]
            : undefined,
          environmentType: payload.environmentType,
          environmentName: payload.environmentName,
          statusDescription: payload.statusDescription,
          inProgress: payload.inProgress,
          error: payload.error,
          success: payload.success,
        }),
      }),
    ]
  }

  private handleAecAgentStatus({
    context,
    payload,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"aecAgentStatus">
  }): GrpcEventEnvelope[] {
    const status = aecAgentStatusMap[payload.status]

    if (!status) {
      this.log.warn(`GrpcEventStream: Unhandled aec agent status '${payload.status}', ignoring event`)
      return []
    }

    return [
      createGardenCliEvent(context, GardenCliEventType.AEC_AGENT_STATUS, {
        case: "aecAgentStatus",
        value: create(AecAgentStatusSchema, {
          aecAgentInfo: payload.aecAgentInfo,
          status,
          statusDescription: payload.statusDescription,
          timestamp: timestampFromDate(new Date(payload.timestamp)),
        }),
      }),
    ]
  }

  private handleActionStatus({
    context,
    payload,
  }: {
    context: GardenEventContext
    payload:
      | CoreEventPayload<"buildStatus">
      | CoreEventPayload<"testStatus">
      | CoreEventPayload<"deployStatus">
      | CoreEventPayload<"runStatus">
  }): GrpcEventEnvelope[] {
    switch (payload.state) {
      case "getting-status":
        return [
          createGardenCliEvent(context, GardenCliEventType.ACTION_STATUS_STARTED, {
            case: "actionStatusStarted",
            value: create(GardenActionGetStatusStartedSchema, {
              actionUlid: this.mapToUlid(payload.actionUid, "actionUid", "actionUlid"),
              startedAt: timestampFromDate(new Date()),
            }),
          }),
        ]
      case "processing":
        return [
          createGardenCliEvent(context, GardenCliEventType.ACTION_RUN_STARTED, {
            case: "actionRunStarted",
            value: create(GardenActionRunStartedSchema, {
              actionUlid: this.mapToUlid(payload.actionUid, "actionUid", "actionUlid"),
              startedAt: timestampFromDate(new Date()),
            }),
          }),
        ]
      case "cached":
      case "ready":
      case "not-ready":
      case "unknown":
      case "failed":
        if (payload.operation === "getStatus") {
          return [
            createGardenCliEvent(context, GardenCliEventType.ACTION_STATUS_COMPLETED, {
              case: "actionStatusCompleted",
              value: create(GardenActionGetStatusCompletedSchema, {
                actionUlid: this.mapToUlid(payload.actionUid, "actionUid", "actionUlid"),
                completedAt: timestampFromDate(new Date()),
                success: payload.state !== "failed",
                needsRun: ["not-ready", "failed", "unknown"].includes(payload.state),
              }),
            }),
          ]
        } else if (payload.operation === "process") {
          const actionKind = payload.actionKind

          let deployRunResult: DeployRunResult | undefined = undefined

          if (actionKind === "deploy" && "status" in payload && payload.status) {
            const deployStatus = payload.status as DeployStatusForEventPayload

            deployRunResult = create(DeployRunResultSchema, {
              createdAt: deployStatus.createdAt,
              mode: deployStatus.mode,
              externalId: deployStatus.externalId,
              externalVersion: deployStatus.externalVersion,
              ingresses:
                deployStatus.ingresses?.map((ingress) =>
                  create(ServiceIngressSchema, {
                    hostname: ingress.hostname,
                    linkUrl: ingress.linkUrl,
                    path: ingress.path || "/",
                    port: ingress.port,
                    protocol: ingress.protocol,
                  })
                ) || [],
              lastMessage: deployStatus.lastMessage,
              lastError: deployStatus.lastError,
              runningReplicas: deployStatus.runningReplicas,
              updatedAt: deployStatus.updatedAt,
            })
          }

          return [
            createGardenCliEvent(context, GardenCliEventType.ACTION_RUN_COMPLETED, {
              case: "actionRunCompleted",
              value: create(GardenActionRunCompletedSchema, {
                actionUlid: this.mapToUlid(payload.actionUid, "actionUid", "actionUlid"),
                completedAt: timestampFromDate(new Date()),
                success: !["not-ready", "failed", "unknown"].includes(payload.state),
                // This is undefined for non-Deploy actions
                deployRunResult,
              }),
            }),
          ]
        } else {
          payload.operation satisfies never // ensure all cases are handled
          this.log.silly(`GrpcEventStream: Unhandled action operation ${payload.operation}`)
          return []
        }
      default:
        payload satisfies never // ensure all cases are handled
        this.log.silly(`GrpcEventStream: Unhandled action state ${payload}`)
        return []
    }
  }

  private handleConfigGraph({
    context,
    payload,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"configGraph">
  }): GrpcEventEnvelope[] {
    const events: GrpcEventEnvelope[] = []

    const actions = payload.graph.getActions().map((action) => {
      return {
        actionUlid: this.mapToUlid(action.uid, "actionUid", "actionUlid"),
        kind: action.kind,
        name: action.name,
        type: action.type,
        disabled: action.isDisabled(),
        dependencies: action.getDependencyReferences(),
      }
    })

    for (const a of actions) {
      events.push(
        createGardenCliEvent(context, GardenCliEventType.ACTION_SCANNED, {
          case: "actionScanned",
          value: create(GardenActionScannedSchema, {
            actionUlid: a.actionUlid,
            scannedAt: timestampFromDate(new Date()),
            name: a.name,
            kind: a.kind,
            type: a.type,
          }),
        })
      )

      events.push(
        createGardenCliEvent(context, GardenCliEventType.ACTION_RESOLVED_GRAPH, {
          case: "actionResolvedGraph",
          value: create(GardenActionResolvedGraphSchema, {
            actionUlid: a.actionUlid,
            graphResolvedAt: timestampFromDate(new Date()),
            dependencies: a.dependencies.map((dep) =>
              create(GardenActionResolvedGraph_DependencySchema, {
                ref: create(GardenActionRefSchema, {
                  // TODO: should we also send the action ULID here for convenience?
                  // actionUlid: this.mapToUlid(payload.graph.getActionByRef(dep).uid, "actionUid", "actionUlid"),
                  name: dep.name,
                  kind: dep.kind,
                }),
                isExplicit: dep.explicit,
                // TODO: do we also need this information in the backend?
                // needsStaticOutputs: dep.needsExecutedOutputs,
                // needsExecutedOutputs: dep.needsExecutedOutputs,
              })
            ),
          }),
        })
      )
    }

    return events
  }

  private handleCommandCompleted({
    context,
  }: {
    context: GardenEventContext
    payload: CoreEventPayload<"sessionCompleted">
  }): GrpcEventEnvelope[] {
    const event = createGardenCliEvent(context, GardenCliEventType.COMMAND_EXECUTION_COMPLETED, {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
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
    const event = createGardenCliEvent(context, GardenCliEventType.COMMAND_EXECUTION_COMPLETED, {
      case: "commandExecutionCompleted",
      value: create(GardenCommandExecutionCompletedSchema, {
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
    const event = createGardenCliEvent(context, GardenCliEventType.COMMAND_EXECUTION_STARTED, {
      case: "commandExecutionStarted",
      value: create(GardenCommandExecutionStartedSchema, {
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
      organizationId: this.garden.cloudApi.organizationId,
      sessionUlid,
      commandUlid,
    }
  }

  /**
   * Maps a legacy {@code UUID} value to a valid ULID.
   *
   * The mapping persists in the {@link #uuidToUlidMap}.
   */
  private mapToUlid(uuid: UUID, fromDescription: string, toDescription: string): ULID {
    const existingSessionUlid = GrpcEventConverter.uuidToUlidMap.get(uuid)
    if (!!existingSessionUlid) {
      return existingSessionUlid
    }

    const generatedUlid = ulid()
    GrpcEventConverter.uuidToUlidMap.set(uuid, generatedUlid)
    this.log.silly(() => `GrpcEventConverter: Mapped ${fromDescription}=${uuid} to ${toDescription}=${generatedUlid}`)
    return generatedUlid
  }
}

export function createGardenCliEvent(
  context: GardenEventContext,
  eventType: GardenCliEventType,
  eventData: GardenCliEvent["eventData"]
): GrpcEventEnvelope {
  const event = create(GardenCliEventSchema, {
    commandUlid: context.commandUlid,
    organizationId: context.organizationId,
    sessionUlid: context.sessionUlid,
    clientVersion: context.clientVersion,
    // actor id will be filled in by the backend
    eventType,
    eventData,
  })

  const envelope: GrpcEventEnvelope = create(EventSchema, {
    eventUlid: nextEventUlid(),
    eventType: EventType.GARDEN_CLI,
    eventData: {
      case: "gardenCli",
      value: event,
    },
  })

  return envelope
}

export function describeGrpcEvent(event: GrpcEventEnvelope): string {
  return `GrpcEvent(${event.eventUlid}, ${event.eventData.case}, ${event.eventData.value?.eventData.case})`
}
