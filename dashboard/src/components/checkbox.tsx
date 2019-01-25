/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { ChangeEvent } from "react"

interface Props {
  name: string
  checked?: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

const CheckBox: React.SFC<Props> = ({ name, onChange, checked = false }) => {
  return (
    <label>
      <input type={"checkbox"} name={name} checked={checked} onChange={onChange} />
    </label>
  )
}

export default CheckBox
