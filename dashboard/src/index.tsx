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
import { unregister } from "./service-worker"

import App from "./app"
import GlobalStyle from "./components/global-style"

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
unregister()

// Hoist Router for smoother hot reloading (hot module replacement).
const rootEl = document.getElementById("root")
const render = (Component) =>
  ReactDOM.render(
    <Router>
      <div>
        <GlobalStyle />
        <Component />
      </div>
    </Router>,
    rootEl
  )

render(App)

// Enable hot module replacement
// @ts-ignore
if (module.hot) {
  // @ts-ignore
  module.hot.accept("./app", () => {
    const NextApp = require("./app").default
    render(NextApp)
  })
}
