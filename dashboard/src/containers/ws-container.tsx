/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Component } from "react"
import { WsMessage } from "../api/types"
import getApiUrl from "../api/get-api-url"

interface Props {
  children: (message: { message?: WsMessage }) => JSX.Element
}

// Include timestamp to ensure shouldComponentUpdate works
interface State {
  timestamp?: number
  message?: WsMessage
}

class WsContainer extends Component<Props, State> {

  _ws: WebSocket | null

  constructor(props) {
    super(props)

    this.state = {}
    this._ws = null
  }

  componentDidMount() {
    const url = getApiUrl()
    this._ws = new WebSocket(`ws://${url}/ws`)

    this._ws.onopen = event => {
      console.log("ws open", event)
    }
    this._ws.onclose = event => {
      // TODO
      console.log("ws close", event)
    }
    this._ws.onmessage = msg => {
      const message = JSON.parse(msg.data) as WsMessage

      // TOOD
      if (message.type === "error") {
        console.error(message)
      }

      if (message.type === "event") {
        console.log(message)
        this.setState({
          timestamp: msg.timeStamp,
          message,
        })
      }
    }
  }

  componentWillUnmount() {
    this._ws && this._ws.close()
  }

  render() {
    return this.props.children({ message: this.state.message })
  }
}

export default WsContainer
