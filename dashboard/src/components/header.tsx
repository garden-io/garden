/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"

import { H2 } from "./text"
import { colors } from "../styles/variables"

const Wrapper = styled.div`
  border-bottom: 1px solid ${colors.border};
`

const Title = styled(H2)`
  margin-bottom: 0;
`

export default () => {
  return (
    <Wrapper className="pl-2 pt-1 pb-1">
      <Title>Dashboard</Title>
    </Wrapper>
  )
}
