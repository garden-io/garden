/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"

import { colors } from "./styles/variables"
import "flexboxgrid/dist/flexboxgrid.min.css"
import "./styles/padding-margin-mixin.scss"
import "./styles/custom-flexboxgrid.scss"
import "./styles/icons.scss"

import { UiStateProvider } from "./contexts/ui"
import { ApiProvider } from "./contexts/api"
import { Modal } from "./components/modal"
import ErrorBoundary from "./components/error-boundary"
import Routes from "./containers/routes"
import { InfoBox } from "./components/InfoBox"

const AppWrapper = styled.div`
  display: flex;
  height: 100vh;
  max-height: 100vh;
  overflow-y: hidden;
  background: ${colors.gardenGrayLighter};
`

const App = () => {
  return (
    <ErrorBoundary errorMsg={"Unable to load dashboard"}>
      <AppWrapper>
        <UiStateProvider>
          <Modal />
          <ApiProvider>
            <Routes />
          </ApiProvider>
          <InfoBox />
        </UiStateProvider>
      </AppWrapper>
    </ErrorBoundary>
  )
}

export default App
