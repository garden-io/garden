/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion/macro"
import React, { useContext } from "react"
import styled from "@emotion/styled/macro"
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

import { EventProvider } from "./context/events"
import { DataProvider } from "./context/data"
import { NavLink } from "./components/links"

import logo from "./assets/logo.png"
import { ReactComponent as OpenSidebarIcon } from "./assets/open-pane.svg"
import { ReactComponent as CloseSidebarIcon } from "./assets/close-pane.svg"

import { UiStateProvider, UiStateContext } from "./context/ui"

// Style and align properly
const Logo = styled.img`
  width: 144px;
  height: 60px;
  max-width: 9rem;
`

const SidebarWrapper = styled.div`
  border-right: 1px solid ${colors.border}
  height: 100vh;
  position: relative;
`
const SidebarContainer = styled.div`
  display: ${props => (props.visible ? `block` : "none")};
  width: ${props => (props.visible ? `10.5rem` : "0")};
`

const SidebarToggleButton = styled.div`
  position: absolute;
  right: -2.2rem;
  top: 2rem;
  width: 1.5rem;
  cursor: pointer;
  font-size: 1.25rem;
`

const AppContainer = () => {
  return (
    <div>
      <DataProvider>
        <EventProvider>
          <UiStateProvider>
            <App />
          </UiStateProvider>
        </EventProvider>
      </DataProvider>
    </div>
  )
}

const App = () => {
  const {
    state: { isSidebarOpen },
    actions: { toggleSidebar },
  } = useContext(UiStateContext)

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
          overflow-y: auto;
        `}
      >
        <div
          className={cls(
            css`
              background-color: ${colors.grayLight}
              flex-grow: 1;
              padding: 1rem 1rem 1rem 3rem;
            `,
          )}
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
