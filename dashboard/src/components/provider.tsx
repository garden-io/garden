/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import { Frame } from "./frame"
import Spinner from "./spinner"
import styled from "@emotion/styled"

interface ProviderPageProps {
  url: string
  active: boolean
}

interface ProviderPageState {
  loading: boolean
}

const ProviderPageWrapper = styled.div`
  flex: 0 auto;
  border: 0;
  width: 100%;
  height: 100%;
`

class ProviderPageFrame extends React.Component<ProviderPageProps, ProviderPageState> {
  constructor(props: ProviderPageProps) {
    super(props)
    this.state = {
      loading: true,
    }
  }
  // componentDidUpdate(prevProps, prevState) {
  //   this.setState({ ...this.props, loading: this.state.loading })
  // }
  hideSpinner = () => {
    this.setState({
      loading: false,
    })
  }
  render() {
    return (
      <ProviderPageWrapper style={{ display: this.props.active ? "block" : "none" }}>
        {this.state.loading ? <Spinner /> : null}
        <Frame
          src={this.props.url}
          onLoad={this.hideSpinner}
          height={"100%"}
          style={{ display: !this.state.loading ? "block" : "none" }}
        />
      </ProviderPageWrapper>
    )
  }
}

export default ProviderPageFrame
