/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, kebabCase } from "lodash"
import React from "react"

import { ConfigProvider, ConfigConsumer } from "../context/config"
import Sidebar from "../components/sidebar"
import { DashboardPage } from "../api"

export interface Page extends DashboardPage {
  path: string
}

const builtinPages: Page[] = [
  {
    title: "Overview",
    description: "Overview",
    path: "/",
    newWindow: false,
    url: "",
  },
  {
    title: "Logs",
    description: "Logs",
    path: "/logs",
    newWindow: false,
    url: "",
  },
]

export default () => (
  <ConfigProvider>
    <ConfigConsumer>
      {({ config }) => {
        // FIXME typecast
        const pages = flatten(config.providers.map(p => p.dashboardPages)).map(p => {
          p["path"] = `/provider/${kebabCase(p.title)}`
          return p as Page
        })
        return <Sidebar pages={[...builtinPages, ...pages]} />
      }}
    </ConfigConsumer>
  </ConfigProvider>
)
