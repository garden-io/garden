/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { initApiStore } from "../api/actions"
import ErrorBoundary from "../components/error-boundary"
import Menu, { menuHeight } from "./menu"
import { useApi } from "../hooks"
import ProviderPageFrame from "../components/provider"

const Graph = React.lazy(() => import("./graph"))
const Logs = React.lazy(() => import("./logs"))
const Overview = React.lazy(() => import("./overview"))

const RouteWrapper = styled.div`
  display: flex;
  flex-direction: row;
  align-content: flex-start;
  width: 100%;
  height: calc(100vh - ${menuHeight});
  overflow-y: auto;
`

const MenuWrapper = styled.div`
  display: flex;
  flex-direction: row;
  height: ${menuHeight};
  width: 100%;
  background: ${colors.gardenWhite};
  box-shadow: 6px 0px 18px rgba(0, 0, 0, 0.04);
`

const providerPageShown: { [path: string]: boolean } = {}

/**
 * This component is responsible for loading the initial API store data.
 * All components lower in the component tree can assume that the init data has been loaded.
 */
export default () => {
  const {
    dispatch,
    store: {
      requestStates,
      entities: { providerPages },
    },
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
        {providerPages.map((page) => (
          // This is a little bit of trickery so that we keep the rendered frame around, instead of unmounting
          // on route change.
          <Route
            key={page.path}
            path={page.path}
            // tslint:disable-next-line: react-this-binding-issue jsx-no-lambda
            children={({ match }) => {
              let url = match || providerPageShown[page.path] ? page.url : ""

              if (match) {
                providerPageShown[page.path] = true
                url = page.url
              }

              return <ProviderPageFrame url={url!} active={!!match} />
            }}
          />
        ))}
      </React.Suspense>
    )
  }

  return (
    <>
      <MenuWrapper>
        <ErrorBoundary errorMsg={"Unable to load menu"}>
          <Menu />
        </ErrorBoundary>
      </MenuWrapper>
      <RouteWrapper>
        <ErrorBoundary errorMsg={"Unable to load page"}>{routes}</ErrorBoundary>
      </RouteWrapper>
    </>
  )
}
