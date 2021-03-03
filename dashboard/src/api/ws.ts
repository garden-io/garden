/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServerWebsocketMessage } from "@garden-io/core/build/src/server/server"
import { Events } from "@garden-io/core/build/src/events"

import { Entities, SupportedEventName, supportedEventNames, TaskState, taskStates } from "../contexts/api"
import produce from "immer"

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
          draft.services[entityName] = {
            ...draft.services[entityName],
            taskState,
          }
          break
        case "build":
          draft.modules[entityName] = {
            ...store.modules[entityName],
            taskState,
          }
          break
        case "run":
          draft.tasks[entityName] = {
            ...store.tasks[entityName],
            taskState,
          }
          break
        case "test":
          // Note that the task payload name for tests has the same format that we use in the
          // store. So there's no need to use getTestKey here.
          // FIXME: We need to make this more robust, although it will resolve itself when we implement
          // https://github.com/garden-io/garden/issues/1177.
          draft.tests[entityName] = {
            ...store.tests[entityName],
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
