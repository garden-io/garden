/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { kebabCase, flatten, entries } from "lodash"
import React from "react"

import Sidebar from "../components/sidebar"
import { useApi } from "../hooks"
import { DashboardPage } from "@garden-io/core/build/src/config/status"

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
    title: "Stack Graph",
    description: "Stack Graph",
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

const SidebarContainer = () => {
  const {
    store: {
      entities: { providers },
    },
  } = useApi()

  const pages = flatten(
    entries(providers).map(([providerName, providerStatus]) => {
      return (providerStatus.dashboardPages || []).map((p) => ({
        ...p,
        path: `/provider/${providerName}/${kebabCase(p.title)}`,
        description: p.description + ` (from provider ${providerName})`,
      }))
    })
  )

  return <Sidebar pages={[...builtinPages, ...pages]} />
}

export default SidebarContainer
