/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ServerWebsocketMessage } from "@garden-io/core/build/src/server/server"
import type { Events } from "@garden-io/core/build/src/events"

import { Entities, SupportedEventName, supportedEventNames, TaskState, taskStates } from "../contexts/api"
import produce from "immer"
import titleize from "titleize"
import type { ActionKind } from "@garden-io/core/build/src/plugin/action-types"

export type WsEventMessage = ServerWebsocketMessage & {
  type: "event"
  name: SupportedEventName
  payload: Events[SupportedEventName]
}

interface TaskStateChangeEventMessage {
  type: "event"
  name: TaskState
  payload: Events[TaskState]
}

/**
 * Type guard to check whether websocket message is a type supported by the Dashboard
 */
export function isSupportedEvent(msg: ServerWebsocketMessage): msg is WsEventMessage {
  return msg.type === "event" && supportedEventNames.has((msg as WsEventMessage).name)
}

/**
 * Type guard to check whether the websocket event is for a task state change that is handled
 * by the Dashboard.
 */
export function isTaskStateChangeEvent(msg: WsEventMessage): msg is TaskStateChangeEventMessage {
  return taskStates.includes(msg.name)
}

// Process the graph response and return a normalized store
export function processWebSocketMessage(store: Entities, message: WsEventMessage) {
  return produce(store, (draft) => {
    if (isTaskStateChangeEvent(message)) {
      const taskState = message.name
      const payload = message.payload
      const entityName = payload.name

      draft.project.taskGraphProcessing = true
      switch (payload.type) {
        case "publish":
          break
        case "deploy":
        case "build":
        case "run":
        case "test":
          const kind = titleize(payload.type) as ActionKind
          draft.actions[kind][entityName] = {
            ...store.actions[kind][entityName],
            taskState,
          }
          break
      }
    }

    if (message.name === "taskGraphComplete") {
      draft.project.taskGraphProcessing = false
    }
  })
}
