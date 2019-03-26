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
import { EventProvider } from "./context/events"
import { DataProvider } from "./context/data"
import { NavLink } from "./components/links"

import logo from "./assets/logo.png"
import { UiStateProvider, UiStateContext } from "./context/ui"

// Style and align properly
const Logo = styled.img`
  height: auto;
  width: 80%;
`

const SidebarWrapper = styled.div`
  border-right: 1px solid ${colors.border};
  min-width: 19rem;
  width: 19rem;
  height: 100vh;
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
  const { state: { isSidebarOpen }, actions: { toggleSidebar } } = useContext(UiStateContext)

  console.log(isSidebarOpen)

  return (
    <div className={css`
      display: flex;
      height: 100vh;
      max-height: 100vh;
      overflow-y: hidden;
    `}>
      <SidebarWrapper>
        <button onClick={toggleSidebar}>Click ME</button>
        <div className={"ml-1"}>
          <NavLink to="/">
            <Logo src={logo} alt="Home" />
          </NavLink>
        </div>
        <Sidebar isOpen={isSidebarOpen} />
      </SidebarWrapper>
      <div className={css`
          display: flex;
          flex-direction: column;
          flex-grow: 1;
          overflow-y: auto;
        `}>
        <div className={cls(css`
            background-color: ${colors.grayLight};
            flex-grow: 1;
          `, "p-2")}>
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
