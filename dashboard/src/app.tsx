/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { css } from "emotion"
import React from "react"
import styled from "@emotion/styled"
import { Route } from "react-router-dom"

import Graph from "./containers/graph"
import Logs from "./containers/logs"
import Overview from "./containers/overview"
import Sidebar from "./containers/sidebar"
import Provider from "./components/provider"

import { colors } from "./styles/variables"
import "flexboxgrid/dist/flexboxgrid.min.css"
import "./styles/padding-margin-mixin.scss"
import "./styles/custom-flexboxgrid.scss"
import "./styles/icons.scss"

import { NavLink } from "./components/links"

import logo from "./assets/logo.png"
import { ReactComponent as OpenSidebarIcon } from "./assets/open-pane.svg"
import { ReactComponent as CloseSidebarIcon } from "./assets/close-pane.svg"

import { UiStateProvider, useUiState } from "./contexts/ui"
import { ApiProvider } from "./contexts/api"

// Style and align properly
const Logo = styled.img`
  width: 144px;
  height: 60px;
  max-width: 9rem;
`

const SidebarWrapper = styled.div`
  height: 100vh;
  position: relative;
  background: ${colors.gardenWhite};
  box-shadow: 6px 0px 18px rgba(0, 0, 0, 0.06);
`

type SidebarContainerProps = {
  visible: boolean
}
const SidebarContainer = styled.div<SidebarContainerProps>`
  display: ${(props) => (props.visible ? `block` : "none")};
  width: ${(props) => (props.visible ? `11.5rem` : "0")};
`

const SidebarToggleButton = styled.div`
  position: absolute;
  right: -2.3rem;
  top: 2rem;
  width: 1.5rem;
  cursor: pointer;
  font-size: 1.125rem;
`

const AppContainer = () => {
  return (
    <div>
      <ApiProvider>
        <UiStateProvider>
          <App />
        </UiStateProvider>
      </ApiProvider>
    </div>
  )
}

const App = () => {
  const {
    state: { isSidebarOpen },
    actions: { toggleSidebar },
  } = useUiState()

  return (
    <div
      className={css`
        display: flex;
        height: 100vh;
        max-height: 100vh;
        overflow-y: hidden;
        background: ${colors.gardenGrayLighter};
      `}
    >
      <SidebarWrapper>
        <SidebarToggleButton onClick={toggleSidebar}>
          {isSidebarOpen ? <CloseSidebarIcon /> : <OpenSidebarIcon />}
        </SidebarToggleButton>
        <SidebarContainer visible={isSidebarOpen}>
          <div className={"ml-1"}>
            <NavLink to="/">
              <Logo src={logo} alt="Home" />
            </NavLink>
          </div>
          <Sidebar />
        </SidebarContainer>
      </SidebarWrapper>
      <div
        className={css`
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          overflow-y: hidden;
        `}
      >
        <div
          className={css`
            background-color: ${colors.gardenGrayLighter};
            flex-grow: 1;
            padding: 1rem 1rem 1rem 2rem;
          `}
        >
          <Route exact path="/" component={Overview} />
          <Route path="/logs/" component={Logs} />
          <Route path="/graph/" component={Graph} />
          <Route path="/providers/:id" component={Provider} />
        </div>
      </div>
    </div>
  )
}

export default AppContainer
