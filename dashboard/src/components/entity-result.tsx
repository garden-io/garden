/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React from "react"
import cls from "classnames"
import { capitalize } from "lodash"
import { css } from "emotion"
import moment from "moment"
import styled from "@emotion/styled"
import Card from "./card"
import { colors } from "../styles/variables"
import { WarningNotification } from "./notifications"
import { ActionIcon } from "./action-icon"
import { EntityResultSupportedTypes } from "../contexts/ui"

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  color: white;
  border-radius: 0.125rem;
  flex: 1 1;
  overflow-y: auto;
  padding: 1rem;
  margin-top: 1rem;
`
const Code = styled.code`
  font-size: 0.8rem;
  white-space: pre-wrap;
`

const ClosePaneContainer = styled.div`
  display: flex;
  margin-left: auto;
`

const IconContainer = styled.span`
  display: inline-block;
  width: 2rem;
  height: 2rem;
  background-size: contain;
  vertical-align: text-top;
  background-repeat: no-repeat;
  vertical-align: top;
`

const Key = ({ text }) => (
  <div
    className={cls(
      css`
        padding-right: 0.5rem;
        font-size: 13px;
        line-height: 19px;
        letter-spacing: 0.01em;
        color: #4c5862;
        opacity: 0.5;
      `,
      "col-xs-12 pr-1"
    )}
  >
    {text}
  </div>
)

const Value = ({ children }) => (
  <div
    className={cls(
      css`
        padding-right: 0.5rem;
        font-size: 13px;
        line-height: 19px;
        letter-spacing: 0.01em;
        color: #4c5862;
      `,
      "col-xs-12"
    )}
  >
    {children}
  </div>
)
const Field = ({ children }) => (
  <div
    className={cls(
      "row",
      "pt-1",
      css`
        flex: 0 0;
      `
    )}
  >
    {children}
  </div>
)

const Header = styled.div`
  font-weight: 500;
  font-size: 1.125rem;
  line-height: 1.6875rem;

  color: ${colors.black};
`

interface Props {
  type: EntityResultSupportedTypes
  name: string
  moduleName: string
  output?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
  duration?: string | null
  onClose: () => void
  onRefresh?: () => void
  loading?: boolean
}

// TODO: Split up into something InfoPane and InfoPaneWithResults. Props are kind of messy.
export default ({
  type,
  name,
  moduleName,
  output,
  startedAt,
  completedAt,
  duration,
  onClose,
  onRefresh,
  loading,
}: Props) => {
  let outputEl: React.ReactNode = null

  if (output) {
    outputEl = (
      <Term>
        <Code>{output}</Code>
      </Term>
    )
  } else if (output === null || output === "") {
    // Output explictly set to nullƒ means that the data was  fetched but the result was empty
    outputEl = (
      <div className="row pt-1">
        <div className="col-xs-12">
          <WarningNotification>No {type} output</WarningNotification>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <div
        className={cls(
          "p-1",
          css`
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 2rem);
          `
        )}
      >
        <div className="row middle-xs">
          <div>
            <IconContainer className={cls(`garden-icon`, `garden-icon--${type}`)} />
          </div>
          <div
            className={css`
              padding-left: 0.5rem;
            `}
          >
            <Header
              className={css`
                margin-block-end: 0;
              `}
            >
              {name}
            </Header>
          </div>

          <ClosePaneContainer>
            {onRefresh && <ActionIcon onClick={onRefresh} inProgress={loading || false} iconClassName="redo-alt" />}
            <ActionIcon onClick={onClose} iconClassName="window-close" />
          </ClosePaneContainer>
        </div>

        <Field>
          <Key text="Type" />
          <Value>{capitalize(type)}</Value>
        </Field>

        <Field>
          <Key text="Module" />
          <Value>{moduleName}</Value>
        </Field>

        {duration && (
          <Field>
            <Key text="Duration" />
            <Value>{duration}</Value>
          </Field>
        )}

        {startedAt && (
          <Field>
            <Key text="Last run" />
            <Value>{moment(startedAt).fromNow()}</Value>
          </Field>
        )}

        {completedAt && (
          <Field>
            <Key text="Completed" />
            <Value>{moment(completedAt).fromNow()}</Value>
          </Field>
        )}
        {/* we only show the output if has content and only for these types */}
        {(type === "test" || type === "run" || type === "task") && outputEl !== null && outputEl}
      </div>
    </Card>
  )
}
