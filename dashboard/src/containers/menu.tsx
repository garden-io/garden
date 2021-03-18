/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"

import Menu from "../components/menu"
import { useApi } from "../hooks"
import { Page } from "../contexts/api"

export const menuHeight = "56px"

const builtinPages: Page[] = [
  {
    name: "overview",
    title: "Overview",
    description: "Overview",
    path: "/",
    newWindow: false,
  },
  {
    name: "stack-graph",
    title: "Stack Graph",
    description: "Stack Graph",
    path: "/graph",
    newWindow: false,
  },
  {
    name: "logs",
    title: "Logs",
    description: "Logs",
    path: "/logs",
    newWindow: false,
  },
]

const MenuContainer = () => {
  const {
    store: {
      entities: { providerPages },
    },
  } = useApi()

  return <Menu pages={[...builtinPages, ...providerPages]} />
}

export default MenuContainer
