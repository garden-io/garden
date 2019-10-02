/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServerWebsocketMessage } from "garden-service/build/src/server/server"
import { Events } from "garden-service/build/src/events"

import {
  Entities,
  Action,
  SupportedEventName,
  supportedEventNames,
} from "../contexts/api"
import getApiUrl from "./get-api-url"
import produce from "immer"

export type WsEventMessage = ServerWebsocketMessage & {
  type: "event",
  name: SupportedEventName,
  payload: Events[SupportedEventName],
}

/**
 * Type guard to check whether websocket message is a type supported by the Dashboard
 */
export function isSupportedEvent(data: ServerWebsocketMessage): data is WsEventMessage {
  return data.type === "event" && supportedEventNames.has((data as WsEventMessage).name)
}

export function initWebSocket(dispatch: React.Dispatch<Action>) {
  const url = getApiUrl()
  const ws = new WebSocket(`ws://${url}/ws`)
  ws.onopen = event => {
    console.log("ws open", event)
  }
  ws.onclose = event => {
    console.log("ws close", event)
  }
  ws.onmessage = msg => {
    const parsedMsg = JSON.parse(msg.data) as ServerWebsocketMessage

    if (parsedMsg.type === "error") {
      console.error(parsedMsg)
    }
    if (isSupportedEvent(parsedMsg)) {
      const processResults = (store: Entities) => processWebSocketMessage(store, parsedMsg)
      dispatch({ type: "wsMessageReceived", processResults })
    }
  }
  return function cleanUp() {
    ws.close()
  }
}

// Process the graph response and return a normalized store
function processWebSocketMessage(store: Entities, message: WsEventMessage) {
  const taskType = message.payload["type"] === "task" ? "run" : message.payload["type"] // convert "task" to "run"
  const taskState = message.name
  const entityName = message.payload["name"]
  return produce(store, draft => {
    //  We don't handle taskGraphComplete events
    if (taskType && taskState !== "taskGraphComplete") {
      draft.project.taskGraphProcessing = true
      switch (taskType) {
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
          draft.tests[entityName] = {
            ...store.tests[entityName],
            taskState,
          }
          break
      }
    }

    // add to requestState graph whenever its taskGraphComplete
    if (taskState === "taskGraphComplete") {
      draft.project.taskGraphProcessing = false
    }
  })
}
