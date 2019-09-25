/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { kebabCase, flatten, entries } from "lodash"
import React from "react"

import Sidebar from "../components/sidebar"
import { useApi } from "../contexts/api"
import { DashboardPage } from "garden-service/build/src/config/status"
import { useMountEffect } from "../util/helpers"

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
    actions,
    store: { entities: { providers } },
  } = useApi()

  useMountEffect(() => {
    async function fetchData() {
      return await actions.loadStatus()
    }
    fetchData()
  })

  let pages: Page[] = []

  pages = flatten(entries(providers).map(([providerName, providerStatus]) => {
    return (providerStatus.dashboardPages || []).map(p => ({
      ...p,
      path: `/provider/${providerName}/${kebabCase(p.title)}`,
      description: p.description + ` (from provider ${providerName})`,
    }))
  }))

  return <Sidebar pages={[...builtinPages, ...pages]} />
}

export default SidebarContainer
