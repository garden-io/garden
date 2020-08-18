/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { colors, fontMedium } from "../styles/variables"
import { WarningNotification } from "./notifications"
import { ActionIcon } from "./action-icon"
import { EntityResultSupportedTypes } from "../contexts/ui"
import { ExternalLink } from "./links"
import { truncateMiddle } from "../util/helpers"
import { CopyActionIcon } from "./copy-action-icon"
import { useUiState } from "../hooks"

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  color: white;
  border-radius: 0.125rem;
  flex: 1 1;
  padding: 1rem;
  margin-bottom: 1rem;
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

// TODO: Just use the test|task results type here instead of specifying each key
interface Props {
  type: EntityResultSupportedTypes
  name: string
  moduleName: string
  artifacts?: string[]
  output?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
  duration?: string | null
  onClose: () => void
  onRefresh?: () => void
  loading?: boolean
}

export default ({
  type,
  name,
  artifacts,
  moduleName,
  output,
  startedAt,
  completedAt,
  duration,
  onClose,
  onRefresh,
  loading,
}: Props) => {
  const {
    actions: { showModal },
  } = useUiState()

  let outputEl: React.ReactNode = null
  artifacts = artifacts || []

  const onCopy = () => {
    const message = (
      <p
        className={css`
          ${fontMedium}
          text-align: center;
        `}
      >
        Copied value to clipboard!
      </p>
    )
    showModal(message)
  }

  if (output) {
    outputEl = (
      <Term>
        <Code>{output}</Code>
      </Term>
    )
  } else if (output === null || output === "") {
    // Output explictly set to null means that the data was fetched but the result was empty
    outputEl = (
      <div className="row pt-1">
        <div className="col-xs-12">
          <WarningNotification>No {type} output</WarningNotification>
        </div>
      </div>
    )
  }

  return (
    <Card
      className={css`
        overflow-y: auto !important;
      `}
    >
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

        {artifacts.length > 0 && (
          <Field>
            <Key text="Artifacts" />
            <div
              className={css`
                max-height: 12rem;
                width: 100%;
                overflow-y: auto;
              `}
            >
              {artifacts.map((path) => {
                return (
                  <Value key={path}>
                    <div
                      className={css`
                        display: flex;
                        justify-content: space-between;
                      `}
                    >
                      <ExternalLink
                        href={`${path.split(".garden")[1]}`}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={path}
                        download
                      >
                        {truncateMiddle(path)}
                      </ExternalLink>
                      <div
                        className={css`
                          margin-top: -4px;
                          margin-bttom: 0.5rem;
                        `}
                      >
                        <CopyActionIcon value={path} onCopy={onCopy} />
                      </div>
                    </div>
                  </Value>
                )
              })}
            </div>
          </Field>
        )}

        {/* we only show the output if has content and only for these types */}
        {(type === "test" || type === "run" || type === "task") && outputEl !== null && outputEl}
      </div>
    </Card>
  )
}
