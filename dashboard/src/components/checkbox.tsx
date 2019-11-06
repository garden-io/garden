/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import styled from "@emotion/styled"
import React, { ChangeEvent } from "react"

import { colors } from "../styles/variables"

const Label = styled.label`
  display: block;
  position: relative;
  padding-left: 1.5rem;
  cursor: pointer;
  font-size: 1rem;
  user-select: none;
  margin-bottom: 0.75rem;
  height: 1rem;
  line-height: 1rem;
`

const Input = styled.input`
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
  :checked {
    background-color: ${colors.gardenPink} !important;
  }
`

const Checkmark = styled.span`
  position: absolute;
  top: 0rem;
  left: 0rem;
  height: 1rem;
  width: 1rem;
  border: 1px solid ${colors.gardenGrayLight};
  :after {
    content: "";
    position: absolute;
    display: none;
    left: 5px;
    top: 1px;
    width: 6px;
    height: 12px;
    border: solid white;
    border-width: 0 3px 3px 0;
    transform: rotate(45deg);
  }
`

const CheckmarkChecked = styled(Checkmark)`
  background-color: ${colors.gardenPink} !important;
  border: none;
  :after {
    display: block;
  }
`

interface Props {
  name: string
  checked?: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

const CheckBox: React.FC<Props> = ({ name, onChange, checked = false, children }) => {
  const Mark = checked ? CheckmarkChecked : Checkmark
  return (
    <Label>
      {children}
      <Input type={"checkbox"} name={name} checked={checked} onChange={onChange} />
      <Mark />
    </Label>
  )
}

export default CheckBox
