/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cls from "classnames"
import { css } from "emotion"
import React from "react"

import { H3, P } from "../components/text"

import { colors } from "../styles/variables"
import { AxiosError } from "axios"

interface Props {
  error?: AxiosError
}

// TODO Style me + add prop interface
const PageError: React.FC<Props> = ({ error }) => {
  let suggestion: any

  const status = error && error.response && error.response.status

  if (status === 500) {
    suggestion = (
      <div>
        <P>Please look at the terminal logs displayed by the dashboard server for details.</P>
        <P color={colors.gardenGray}>
          <span role="img" aria-label="Tip:">
            💡
          </span>{" "}
          You can get more detailed logs by running the server with <code>--log-level=debug</code>.
        </P>
      </div>
    )
  }

  return (
    <div
      className={cls(
        css`
          text-align: center;
        `,
        "P-2"
      )}
    >
      <H3 color={colors.gardenPink}>Whoops, something went wrong.</H3>
      {error && error.message && (
        <P>
          <span role="img" aria-label="Error:">
            ❌
          </span>{" "}
          {error.message}
        </P>
      )}
      {suggestion}
    </div>
  )
}

export default PageError
