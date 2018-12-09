/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { flatten, kebabCase } from "lodash"
import React from "react"

import { ConfigConsumer } from "../context/config"
import Sidebar from "../components/sidebar"
import { DashboardPage } from "../api/types"

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
    title: "Service Graph",
    description: "Service Graph",
    path: "/graph",
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
  <ConfigConsumer>
    {({ config }) => {
      const pages = flatten(config.providers.map(p => p.dashboardPages)).map((p: Page) => {
        p.path = `/provider/${kebabCase(p.title)}`
        return p
      })
      return <Sidebar pages={[...builtinPages, ...pages]} />
    }}
  </ConfigConsumer>
)
