/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion"
import styled from "@emotion/styled"
import { max, flatten } from "lodash"
import React, { Component } from "react"
import Select from "react-select"

import Terminal from "./terminal"
import Card, { CardTitle } from "./card"
import { colors } from "../styles/variables"

import { ServiceLogEntry } from "@garden-io/core/build/src/types/plugin/service/getServiceLogs"
import { ActionIcon } from "./action-icon"

interface Props {
  logs: { [serviceName: string]: ServiceLogEntry[] }
  onRefresh: (serviceNames: string[]) => void
}

interface State {
  loading: boolean
  selectedService: { value: string; label: string }
}

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
`

const selectFontSize = "0.9rem"

// TODO: Roll our own Select component instead of using react-select, it's an overkill.
const selectStyles = {
  control: (base, state) => ({
    ...base,
    "fontSize": selectFontSize,
    "boxShadow": state.isFocused ? `0 0 0 1px ${colors.gardenGrayLight}` : 0, // The box shadow adds width to the border
    "borderColor": state.isFocused ? colors.gardenGrayLight : base.borderColor,
    "&:hover": {
      borderColor: state.isFocused ? colors.gardenGrayLight : base.borderColor,
    },
  }),
  option: (base, state) => ({
    ...base,
    color: colors.gardenBlack,
    fontSize: selectFontSize,
    backgroundColor: state.isSelected
      ? colors.gardenGreenDark
      : state.isFocused
      ? colors.gardenGreenLight
      : colors.gardenWhite,
  }),
}

// TODO: Use functional component
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
    const serviceNames = Object.keys(this.props.logs)
    if (!serviceNames.length) {
      return
    }
    this.props.onRefresh(serviceNames)
    this.setState({ loading: true })
  }

  render() {
    const { logs } = this.props
    const { loading, selectedService } = this.state
    const serviceNames = Object.keys(logs)
    const maxServiceName = max(serviceNames.map((s) => s.length)) || 5
    const options = [{ value: "all", label: "All service logs" }].concat(
      serviceNames.map((name) => ({ value: name, label: name }))
    )

    const { value, label } = selectedService
    const title = value === "all" ? label : `${label} logs`
    const filteredLogs = value === "all" ? flatten(Object.values(logs)) : logs[value]

    return (
      <div className="pl-1" style={{ marginTop: "1rem", marginRight: "1rem" }}>
        <div
          className={cls(
            css`
              min-width: 12rem;
              width: 30%;
            `,
            "mb-1"
          )}
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
              <ActionIcon onClick={this.refresh} inProgress={loading} iconClassName="redo-alt" />
            </Header>
            <Terminal entries={filteredLogs} sectionPad={maxServiceName} showServiceName={value === "all"} />
          </div>
        </Card>
      </div>
    )
  }
}

export default Logs
