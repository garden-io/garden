/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import Card from "./card"
import styled from "@emotion/styled"
import { useUiState } from "../hooks"
import { ActionIcon } from "./action-icon"
import { css } from "emotion"
import { colors } from "../styles/variables"

const Wrapper = styled(Card)`
  background-color: ${colors.gardenRed};
  color: ${colors.gardenWhite};
  position: absolute;
  bottom: 0.5rem;
  right: 2rem;
  z-index: 1;
  max-width: 35rem;
  padding: 0.8rem 1.2rem;
  min-width: 15rem;
  width: initial;
`

const Content = styled.div`
  width: 100%;
`

// TODO: Handle state updates from multiple components. Currently this is only to display a
// warning message when webscoket connection is lost.
export const InfoBox = () => {
  const {
    state: {
      infoBox: { visible, content },
    },
    actions,
  } = useUiState()

  if (!visible) {
    return null
  }

  const handleCloseClick = () => {
    actions.hideInfoBox()
  }

  return (
    <Wrapper>
      <div
        className={css`
          align-items: center;
          display: flex;
          justify-content: space-between;
        `}
      >
        <Content>{content}</Content>
        <ActionIcon onClick={handleCloseClick} iconClassName="window-close" invert />
      </div>
    </Wrapper>
  )
}
