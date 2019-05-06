/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion/macro"
import styled from "@emotion/styled/macro"
import { max } from "lodash"
import React, { Component } from "react"
import Select from "react-select"

import Terminal from "./terminal"
import Card, { CardTitle } from "./card"
import { colors } from "../styles/variables"
import { LoadLogs } from "../context/data"
import { getServiceNames } from "../util/helpers"

import { ServiceLogEntry } from "garden-cli/src/types/plugin/outputs"
import { ConfigDump } from "garden-cli/src/garden"
import { RefreshButton } from "./RefreshButton"

interface Props {
  config: ConfigDump
  logs: ServiceLogEntry[]
  loadLogs: LoadLogs
}

interface State {
  loading: boolean
  selectedService: { value: string, label: string }
}

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`

// TODO: Roll our own Select component instead of using react-select, it's an overkill.
const selectStyles = {
  control: (base, state) => ({
    ...base,
    "boxShadow": state.isFocused ? `0 0 0 1px ${colors.gardenGrayLight}` : 0, // The box shadow adds width to the border
    "borderColor": state.isFocused ? colors.gardenGrayLight : base.borderColor,
    "&:hover": {
      borderColor: state.isFocused ? colors.gardenGrayLight : base.borderColor,
    },
  }),
  option: (base, state) => ({
    ...base,
    color: colors.gardenBlack,
    backgroundColor: state.isSelected
      ? colors.gardenGreenDark
      : state.isFocused ? colors.gardenGreenLight : colors.gardenWhite,
  }),
}

class Logs extends Component<Props, State> {

  constructor(props) {
    super(props)

    // TODO Use tab id instead of title
    this.state = {
      loading: false,
      selectedService: { value: "all", label: "All service logs" },
    }
    this.handleChange = this.handleChange.bind(this)
    this.refresh = this.refresh.bind(this)
  }

  handleChange(selectedService) {
    this.setState({ selectedService })
  }

  componentDidUpdate(_, prevState) {
    if (prevState.loading) {
      this.setState({ loading: false })
    }
  }

  refresh() {
    this.props.loadLogs(getServiceNames(this.props.config.moduleConfigs), true)
    this.setState({ loading: true })
  }

  render() {
    const { config, logs } = this.props
    const { loading, selectedService } = this.state
    const serviceNames = getServiceNames(config.moduleConfigs)
    const maxServiceName = (max(serviceNames) || []).length
    const options = [{ value: "all", label: "All service logs" }]
      .concat(serviceNames.map(name => ({ value: name, label: name })))

    const { value, label } = selectedService
    const title = value === "all" ? label : `${label} logs`
    const filteredLogs = value === "all" ? logs : logs.filter(l => l.serviceName === value)

    return (
      <div>
        <div
          className={cls(css`
            min-width: 12rem;
            width: 30%;
          `, "mb-1")}
        >
          <Select
            value={this.state.selectedService}
            options={options}
            styles={selectStyles}
            onChange={this.handleChange}
          />
        </div>
        <Card>
          <div>
            <Header className="p-1">
              <CardTitle>{title}</CardTitle>
              <RefreshButton onClick={this.refresh} loading={loading} />
            </Header>
            <Terminal
              entries={filteredLogs}
              sectionPad={maxServiceName}
              showServiceName={value === "all"}
            />
          </div>
        </Card>
      </div>
    )
  }

}

export default Logs
