/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import { useEffect, useState } from "react"
import { ServerWebsocketMessage } from "garden-service/build/src/server/server"
import { Events, EventName } from "garden-service/build/src/events"

import getApiUrl from "../api/get-api-url"
import { Extends } from "garden-service/build/src/util/util"

// FIXME: We shouldn't repeat the keys for both the type and the set below
export type SupportedEventName = Extends<
  EventName, "taskPending" | "taskProcessing" | "taskComplete" | "taskGraphComplete" | "taskError"
>

export const supportedEventNames: Set<SupportedEventName> = new Set(
  ["taskPending", "taskProcessing", "taskComplete", "taskGraphComplete", "taskError"],
)

export type WsEventMessage = ServerWebsocketMessage & {
  type: "event",
  name: SupportedEventName,
  payload: Events[SupportedEventName],
}

/**
 * Type guard to check whether websocket message is a type supported by the Dashboard
 */
function isSupportedEvent(data: ServerWebsocketMessage): data is WsEventMessage {
  return data.type === "event" && supportedEventNames.has((data as WsEventMessage).name)
}

type Context = { message?: WsEventMessage }

export const EventContext = React.createContext<Context>({} as Context)

interface WsOutput {
  message?: WsEventMessage
}

function useWs(): WsOutput {
  const [data, setData] = useState<WsOutput>()
  useEffect(() => {
    const url = getApiUrl()
    const ws = new WebSocket(`ws://${url}/ws`)

    ws.onopen = event => {
      console.log("ws open", event)
    }
    ws.onclose = event => {
      // TODO
      console.log("ws close", event)
    }
    ws.onmessage = msg => {
      const parsedMsg = JSON.parse(msg.data) as ServerWebsocketMessage

      // TODO
      if (parsedMsg.type === "error") {
        console.error(parsedMsg)
      }

      if (isSupportedEvent(parsedMsg)) {
        console.log(parsedMsg)
        setData({ message: parsedMsg })
      }
    }
    return function cleanUp() {
      console.log("ws cleanup")
      ws.close()
    }
  }, [])

  const message = data ? data.message : undefined
  return { message }
}

export const EventProvider: React.FC = ({ children }) => {
  const { message } = useWs()

  return (
    <EventContext.Provider value={{ message }}>
      {children}
    </EventContext.Provider>
  )
}
