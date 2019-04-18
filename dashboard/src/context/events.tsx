/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import { useEffect, useState } from "react"
import getApiUrl from "../api/get-api-url"
import { WsMessage } from "../api/types"

type Context = { message?: WsMessage }

export const EventContext = React.createContext<Context>({} as Context)

interface WsOutput {
  message?: WsMessage
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
      const parsedMsg = JSON.parse(msg.data) as WsMessage

      // TOOD
      if (parsedMsg.type === "error") {
        console.error(parsedMsg)
      }

      if (parsedMsg.type === "event") {
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

export const EventProvider: React.SFC = ({ children }) => {
  const { message } = useWs()

  return (
    <EventContext.Provider value={{ message }}>
      {children}
    </EventContext.Provider>
  )
}
