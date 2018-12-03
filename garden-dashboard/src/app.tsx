/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion/macro"
import React from "react"
import styled from "@emotion/styled/macro"
import { Route } from "react-router-dom"

import Logs from "./containers/logs"
import Overview from "./containers/overview"
import Sidebar from "./containers/sidebar"

import Header from "./components/header"
import Provider from "./components/provider"

import { colors } from "./styles/variables"
import "flexboxgrid/dist/flexboxgrid.min.css"
import "./styles/padding-margin-mixin.scss"

// FIXME: Using some hard coded colors I stole off of CodePen.io

const SidebarWrapper = styled.div`
  background-color: rgb(36, 40, 42);
  border-right: 1px solid ${colors.border};
  color: rgb(204, 204, 204);
  min-width: 12rem;
  width: 16vw;
  max-width: 19rem;
  height: 100vh;
`

const App = () => (
  <div>
    <div className={css`
      display: flex;
      min-height: 100vh;
    `}>
      <SidebarWrapper>
        <Sidebar />
      </SidebarWrapper>
      <div className={css`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      `}>
        <Header />
        <div className={cls(css`
          background-color: ${colors.lightGray};
          flex-grow: 1;
        `, "p-2")}>
          <Route exact path="/" component={Overview} />
          <Route path="/logs/" component={Logs} />
          <Route path="/providers/:id" component={Provider} />
        </div>
      </div>
    </div>
  </div>
)

export default App
