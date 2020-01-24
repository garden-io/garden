/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"
import { Route } from "react-router-dom"

import Sidebar from "./containers/sidebar"
import Provider from "./components/provider"

import { colors } from "./styles/variables"
import "flexboxgrid/dist/flexboxgrid.min.css"
import "./styles/padding-margin-mixin.scss"
import "./styles/custom-flexboxgrid.scss"
import "./styles/icons.scss"

import { UiStateProvider } from "./contexts/ui"
import { ApiProvider } from "./contexts/api"
import { Modal } from "./components/modal"
import ErrorBoundary from "./components/error-boundary"

const Graph = React.lazy(() => import("./containers/graph"))
const Logs = React.lazy(() => import("./containers/logs"))
const Overview = React.lazy(() => import("./containers/overview"))

const AppWrapper = styled.div`
  display: flex;
  height: 100vh;
  max-height: 100vh;
  overflow-y: hidden;
  background: ${colors.gardenGrayLighter};
`

const RouteWrapper = styled.div`
  background-color: ${colors.gardenGrayLighter};
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow-y: hidden;
  padding: 1rem 1rem 1rem 2rem;
`

const SidebarWrapper = styled.div`
  height: 100vh;
  position: relative;
  background: ${colors.gardenWhite};
  box-shadow: 6px 0px 18px rgba(0, 0, 0, 0.06);
`

const App = () => {
  return (
    <ErrorBoundary errorMsg={"Unable to load dashboard"}>
      <ApiProvider>
        <UiStateProvider>
          <AppWrapper>
            <Modal />
            <SidebarWrapper>
              <ErrorBoundary errorMsg={"Unable to load sidebar"}>
                <Sidebar />
              </ErrorBoundary>
            </SidebarWrapper>
            <RouteWrapper>
              <ErrorBoundary errorMsg={"Unable to load page"}>
                <React.Suspense fallback={<div />}>
                  <Route exact path="/" component={Overview} />
                  <Route path="/logs/" component={Logs} />
                  <Route path="/graph/" component={Graph} />
                  <Route path="/providers/:id" component={Provider} />
                </React.Suspense>
              </ErrorBoundary>
            </RouteWrapper>
          </AppWrapper>
        </UiStateProvider>
      </ApiProvider>
    </ErrorBoundary>
  )
}

export default App
