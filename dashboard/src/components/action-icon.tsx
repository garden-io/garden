/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React from "react"

import { colors } from "../styles/variables"

interface Props {
  onClick: () => void
  inProgress?: boolean
  iconClassName: "redo-alt" | "window-close"
}

const Button = styled.div`
  border-radius: 4px;
  margin: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  :active {
    opacity: 0.5;
  }
`

const Icon = styled.i`
  color: ${colors.gardenGray};
  :hover {
    color: ${colors.gardenPink};
  }
  :active {
    opacity: 0.5;
  }
`

const IconLoading = styled(Icon)`
  animation: spin 0.5s infinite linear;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`

export const ActionIcon: React.FC<Props> = ({ inProgress, onClick, iconClassName }) => {
  const IconComp = inProgress ? IconLoading : Icon

  return (
    <Button onClick={onClick}>
      <IconComp className={`fas fa-${iconClassName}`} />
    </Button>
  )
}
