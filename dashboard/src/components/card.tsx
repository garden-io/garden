/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"
import cls from "classnames"

import { colors, fontMedium } from "../styles/variables"

interface CardProps {
  className?: string
  children: React.ReactNode
  title?: string
  backgroundColor?: string
}

interface WrapperProps {
  backgroundColor?: string
}

const Wrapper = styled.div<WrapperProps>`
  background-color: ${(props) => props.backgroundColor || colors.gardenWhite};
  box-shadow: 0px 6px 18px rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  width: 100%;
  overflow: hidden;
`

export const CardTitle = styled.h3`
  ${fontMedium};
  font-size: 1.3rem;
  margin: 0;
`

const Card: React.FC<CardProps> = ({ className, children, title, backgroundColor, ...props }) => {
  const titleEl = title ? (
    <div className="p-1">
      <CardTitle>{title}</CardTitle>
    </div>
  ) : null
  return (
    <Wrapper className={cls(className, "mb-2")} backgroundColor={backgroundColor} {...props}>
      {titleEl}
      {children}
    </Wrapper>
  )
}

export default Card
