/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RouteComponentProps } from "react-router-dom"
import React from "react"
import H from "history"

import { Page } from "../containers/sidebar"

interface RoutePropsWithState extends RouteComponentProps {
  location: H.Location<Page>
}

const Provider: React.FC<RoutePropsWithState> = (props) => {
  const page = props.location.state
  return (
    <div>
      <h2>Provider dashboard</h2>
      <p>{page.description}</p>
    </div>
  )
}

export default Provider
