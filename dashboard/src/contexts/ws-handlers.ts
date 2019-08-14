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
  Store,
  Action,
  SupportedEventName,
  supportedEventNames,
} from "./api"
import getApiUrl from "../api/get-api-url"

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

export function initWebSocket(store: Store, dispatch: React.Dispatch<Action>) {
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
      dispatch({ store: processWebSocketMessage(store, parsedMsg), type: "wsMessageReceived" })
    }
  }
  return function cleanUp() {
    ws.close()
  }
}

// Process the graph response and return a normalized store
function processWebSocketMessage(store: Store, message: WsEventMessage) {
  const storeDraft = { ...store }
  const taskType = message.payload["type"] === "task" ? "run" : message.payload["type"] // convert "task" to "run"
  const taskState = message.name
  const entityName = message.payload["name"]
  //  We don't handle taskGraphComplete events
  if (taskType && taskState !== "taskGraphComplete") {
    storeDraft.requestStates.fetchTaskStates.loading = true
    switch (taskType) {
      case "publish":
        break
      case "deploy":
        storeDraft.entities.services[entityName] = {
          ...storeDraft.entities.services[entityName],
          taskState,
        }
        break
      case "build":
        storeDraft.entities.modules[entityName] = {
          ...store.entities.modules[entityName],
          taskState,
        }
        break
      case "run":
        storeDraft.entities.tasks[entityName] = {
          ...store.entities.tasks[entityName],
          taskState,
        }
        break
      case "test":
        storeDraft.entities.tests[entityName] = {
          ...store.entities.tests[entityName], taskState,
        }
        break
    }
  }

  if (taskState === "taskGraphComplete") { // add to requestState graph whenever its taskGraphComplete
    storeDraft.requestStates.fetchTaskStates.loading = false
  }

  return storeDraft
}
