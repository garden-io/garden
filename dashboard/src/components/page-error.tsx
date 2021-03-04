/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
  error?: AxiosError | string
}

const renderEmoji = (emoji: string, label: string) => {
  return (
    <>
      <span role="img" aria-label={label} style={{ marginRight: "0.5em", fontSize: "0.8rem" }}>
        {emoji}
      </span>{" "}
    </>
  )
}

// TODO Style me + add prop interface
const PageError: React.FC<Props> = ({ error }) => {
  let suggestion = <div />
  let message = ""

  if (typeof error === "string") {
    message = error
  } else {
    const status = error && error.response && error.response.status
    if (status === 500) {
      suggestion = (
        <div>
          <P>Please look at the terminal logs displayed by the dashboard server for details.</P>
          <P color={colors.gardenGray}>
            {renderEmoji("💡", "Tip:")}
            You can get more detailed logs by running the server with <code>--log-level=debug</code>.
          </P>
        </div>
      )
    }
    if (error && error.message) {
      message = error.message
    }
  }

  return (
    <div
      className={cls(
        css`
          width: 100%;
          text-align: center;
        `
      )}
    >
      <H3 color={colors.gardenRed}>Whoops, something went wrong.</H3>
      {message && (
        <P>
          {renderEmoji("❌", "Error:")}
          {message}
        </P>
      )}
      {suggestion}
    </div>
  )
}

export default PageError
