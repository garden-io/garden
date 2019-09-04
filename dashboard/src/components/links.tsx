/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import styled from "@emotion/styled"
import { NavLink as ReactRouterNavLink } from "react-router-dom"

import { colors } from "../styles/variables"

export const ExternalLink = styled.a`
  cursor: pointer;
  text-decoration: underline;
  &:visited {
  }
  &:hover {
    color: ${colors.gardenPink};
  }
`

export const NavLink = (props) => (
  <ReactRouterNavLink {...props} activeStyle={{ color: colors.gardenPink, fontWeight: 500 }} />
)
