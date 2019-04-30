/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion/macro"
import React from "react"

import { H3 } from "../components/text"

import { colors } from "../styles/variables"

// TODO Style me + add prop interface
const PageError: React.FC<any> = ({ error }) => {
  let suggestion
  const status = error.response && error.response.status
  if (status === 500) {
    suggestion = (
      <div>
        <p>
          Are you sure Garden server is running? You can run it with:
        </p>
        <p>
          <code>garden serve</code>
        </p>
      </div>
    )
  }
  return (
    <div
      className={cls(css`
        text-align: center;
      `, "p-2")}
    >
      <H3 color={colors.gardenPink}>
        Whoops, something went wrong.
      </H3>
      <p>Messsage: {error.message}</p>
      {suggestion}
    </div>
  )
}

export default PageError
