/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled/macro"
import { flatten, max } from "lodash"
import React, { Component } from "react"

import Terminal from "./terminal"
import { FetchConfigResponse, FetchLogsResponse } from "../api/types"
import Card, { CardTitle } from "./card"
import { colors } from "../styles/variables"
import { LoadLogs } from "../context/data"

interface Props {
  config: FetchConfigResponse
  logs: FetchLogsResponse
  loadLogs: LoadLogs
}

interface State {
  selectedService: string
}

const Header = styled.div`
  display: flex;
  justify-content: space-between;
`

const Icon = styled.i`
  color: ${colors.gardenPink};
  font-size: 1.5rem;
  cursor: pointer;
  :active {
    color: ${colors.gardenPinkLighten(0.7)}
  }
`

class Logs extends Component<Props, State> {

  constructor(props) {
    super(props)

    // TODO Use tab id instead of title
    this.state = {
      selectedService: "all",
    }
    this.handleChange = this.handleChange.bind(this)
    this.refresh = this.refresh.bind(this)
  }

  handleChange(event) {
    this.setState({ selectedService: event.target.value })
  }

  refresh() {
    const serviceNames = flatten(this.props.config.modules.map(m => m.serviceNames))
    this.props.loadLogs(serviceNames, true)
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
        <Card>
          <div>
            <Header className="pl-1 pr-1 pb-1">
              <CardTitle>{title}</CardTitle>
              <Icon className={"fas fa-sync-alt"} onClick={this.refresh} />
            </Header>
            <Terminal
              entries={filteredLogs}
              sectionPad={maxServiceName}
              title={title}
              showServiceName={selectedService === "all"}
            />
          </div>
        </Card>
      </div>
    )
  }

}

export default Logs
