/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import ReactDOM from "react-dom"
import { BrowserRouter as Router } from "react-router-dom"
import App from "./app"

it("renders without crashing", () => {
  const div = document.createElement("div")
  // Need to wrap with Router, see here: https://stackoverflow.com/a/50530166
  ReactDOM.render(
    <Router>
      <App />
    </Router>,
    div
  )
  ReactDOM.unmountComponentAtNode(div)
})
