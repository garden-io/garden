/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled/macro"
import React from "react"

import { colors, fontMedium } from "../styles/variables"

interface CardProps {
  children: JSX.Element
  title?: string
}

const Wrapper = styled.div`
  background-color: ${colors.gardenWhite};
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
`

export const CardTitle = styled.h3`
  ${fontMedium};
  font-size: 1.3rem;
  margin: 0;
`

const Card: React.SFC<CardProps> = ({ children, title }) => {
  const titleEl = title
    ? (
      <div className="pl-1 pr-1 pb-1">
        <CardTitle>{title}</CardTitle>
      </div>
    )
    : null
  return (
    <Wrapper className="pt-1 mt-2">
      {titleEl}
      {children}
    </Wrapper>
  )
}

export default Card
