/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import { fetchStatus } from "../api"
import { FetchStatusResponse } from "../api/types"
import FetchContainer from "../containers/fetch-container"

type Context = { status: FetchStatusResponse }
const StatusContext = React.createContext<Context | null>(null)

const StatusConsumer = StatusContext.Consumer

const Error = () => <p>Error retrieving status</p>

const StatusProvider = ({ children }) => (
  <FetchContainer<FetchStatusResponse> ErrorComponent={Error} skipSpinner fetchFn={fetchStatus}>
    {({ data: status }) => (
      <StatusContext.Provider value={{ status }}>
        {children}
      </StatusContext.Provider>
    )}
  </FetchContainer>
)

export { StatusProvider, StatusConsumer }
