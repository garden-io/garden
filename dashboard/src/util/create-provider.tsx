/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import FetchContainer from "../containers/fetch-container"

// TODO Add types to return components
export function makeProvider<T>(fetchFn, ErrorComponent: React.SFC<any> | React.ComponentClass<any>) {

  type Ctx = { data: T }
  const Ctx = React.createContext<Ctx | null>(null)

  const Provider = ({ children }) => (
    <FetchContainer<T> ErrorComponent={ErrorComponent} fetchFn={fetchFn}>
      {({ data }) => (
        <Ctx.Provider value={{ data }}>
          {children}
        </Ctx.Provider>
      )}
    </FetchContainer>
  )

  return { Provider, Consumer: Ctx.Consumer }
}
