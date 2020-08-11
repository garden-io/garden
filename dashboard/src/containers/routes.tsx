/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React, { useEffect } from "react"
import { Route } from "react-router-dom"

import { colors } from "../styles/variables"
import PageError from "../components/page-error"
import Spinner from "../components/spinner"
import Provider from "../components/provider"
import { initApiStore } from "../api/actions"
import ErrorBoundary from "../components/error-boundary"
import Sidebar from "../containers/sidebar"
import { useApi } from "../hooks"

const Graph = React.lazy(() => import("./graph"))
const Logs = React.lazy(() => import("./logs"))
const Overview = React.lazy(() => import("./overview"))

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

/**
 * This component is responsible for loading the initial API store data.
 * All components lower in the component tree can assume that the init data has been loaded.
 */
export default () => {
  const {
    dispatch,
    store: { requestStates },
  } = useApi()

  useEffect(() => {
    const fetchData = async () => initApiStore(dispatch)

    if (!requestStates.config.initLoadComplete) {
      fetchData()
    }
  }, [dispatch, requestStates.config.initLoadComplete])

  let routes: React.ReactNode

  if (requestStates.config.error) {
    routes = <PageError error={requestStates.config.error} />
  } else if (!requestStates.config.initLoadComplete) {
    routes = <Spinner />
  } else {
    routes = (
      <React.Suspense fallback={<div />}>
        <Route exact path="/" component={Overview} />
        <Route path="/logs/" component={Logs} />
        <Route path="/graph/" component={Graph} />
        <Route path="/providers/:id" component={Provider} />
      </React.Suspense>
    )
  }

  return (
    <>
      <SidebarWrapper>
        <ErrorBoundary errorMsg={"Unable to load sidebar"}>
          <Sidebar />
        </ErrorBoundary>
      </SidebarWrapper>
      <RouteWrapper>
        <ErrorBoundary errorMsg={"Unable to load page"}>{routes}</ErrorBoundary>
      </RouteWrapper>
    </>
  )
}
