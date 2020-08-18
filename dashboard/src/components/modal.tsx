/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import Card from "./card"
import styled from "@emotion/styled"
import { useUiState } from "../hooks"

interface WrapperProps {
  onAnimationEnd: () => void
  animation?: "fadein" | "fadeout"
}

const Wrapper = styled(Card)<WrapperProps>`
  z-index: 1;
  position: absolute;
  left: 50%;
  top: 0%;
  transform: translate(-50%, 0%);
  min-width: 40rem;
  width: 50%;
  overflow: auto;
  opacity: 0;
  animation: fadein 3s 1;
  animation-fill-mode: forwards;
  @keyframes fadein {
    0% {
      opacity: 0;
    }
    2% {
      opacity: 1;
    }
    95% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
`

const Content = styled.div`
  background-color: #fefefe;
  margin: auto auto;
  width: 80%;
`

/**
 * A simple modal component that fades in and then automatically fades out again, based on the
 * global Modal UI state.
 *
 * Doesn't do much at the moment but we can add props and functionality as the need arises.
 */
export const Modal: React.FC = () => {
  const {
    state: {
      modal: { visible, content },
    },
    actions: { hideModal },
  } = useUiState()

  const handleAnimationEnd = () => {
    if (visible) {
      hideModal()
    }
  }

  if (!visible) {
    return null
  }

  return (
    <Wrapper onAnimationEnd={handleAnimationEnd}>
      <Content>{content}</Content>
    </Wrapper>
  )
}
