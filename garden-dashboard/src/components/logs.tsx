/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, max } from "lodash"
import React, { Component } from "react"

import Terminal from "./terminal"
import { FetchConfigResponse, FetchLogResponse } from "../api"

interface Props {
  config: FetchConfigResponse
  logs: FetchLogResponse
}

interface State {
  selectedService: string
}

class Logs extends Component<Props, State> {

  constructor(props) {
    super(props)

    // TODO Use tab id instead of title
    this.state = {
      selectedService: "all",
    }
    this.handleChange = this.handleChange.bind(this)
  }

  handleChange(event) {
    this.setState({ selectedService: event.target.value })
  }

  render() {
    const { config, logs } = this.props
    const { selectedService } = this.state
    const serviceNames = flatten(config.modules.map(m => m.serviceNames))
    const maxServiceName = max(serviceNames).length
    const title = selectedService === "all"
      ? "All service logs"
      : `${selectedService} logs`
    const filteredLogs = selectedService === "all"
      ? logs
      : logs.filter(l => l.serviceName === selectedService)
    return (
      <div>
        <div className="mb-1">
          <select value={this.state.selectedService} onChange={this.handleChange}>
            <option value="all">All service logs</option>
            {serviceNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <Terminal
          entries={filteredLogs}
          sectionPad={maxServiceName}
          title={title}
          showServiceName={selectedService === "all"}
        />
      </div>
    )
  }

}

export default Logs
