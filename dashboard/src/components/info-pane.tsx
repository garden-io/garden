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
import styled from "@emotion/styled"
import Card from "../components/card"
import { colors } from "../styles/variables"
import { RenderedNode } from "garden-cli/src/config-graph"
import { RefreshButton } from "./RefreshButton"
import { ErrorNotification } from "./notifications"

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  color: white;
  border-radius: 2px;
  max-height: 45rem;
  overflow-y: auto;
  padding: 1rem;
`
const Code = styled.code`
  font-size: .8rem;
  white-space: pre-wrap;
`

const ClosePaneContainer = styled.div`
  display: flex;
  margin-left: auto;
`
const ClosePane = styled.div`
  cursor: pointer;
  background-size: contain;
  width: 2rem;
  height: 2rem;
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
interface Props {
  node: RenderedNode
  clearGraphNodeSelection: () => void
  onRefresh?: () => void
  loading?: boolean
  output?: string | null
  startedAt?: string | null
  completedAt?: string | null
  duration?: string | null
}

const Key = ({ text }) => (
  <div
    className={cls(css`
      font-weight: bold;
    `,
      "col-xs-5 col-lg-3 pr-1")}
  >
    {text}
  </div>
)

// TODO: Split up into something InfoPane and InfoPaneWithResults. Props are kind of messy.
export const InfoPane: React.FC<Props> = ({
  clearGraphNodeSelection,
  loading,
  onRefresh,
  node,
  output,
  startedAt,
  completedAt,
  duration,
}) => {
  const { name, moduleName, type } = node
  let outputEl: React.ReactNode = null

  if (output) {
    outputEl = (
      <Term>
        <Code>{output}</Code>
      </Term>
    )
  } else if (output === null) {
    // Output explictly set to null means that the data was  fetched but the result was empty
    outputEl = <ErrorNotification>No test output</ErrorNotification>
  }

  return (
    <Card>
      <div className="p-1">
        <div className="row">
          <div>
            <IconContainer className={cls(`garden-icon`, `garden-icon--${type}`)} />
          </div>
          <div
            className={css`
              padding-left: .5rem;
            `}
          >
            <h2
              className={css`
                margin-block-end: 0;
              `}
            >
              {name}
            </h2>
          </div>

          <ClosePaneContainer>
            {onRefresh && (
              <div className={css`margin-right: 1rem;`}>
                <RefreshButton onClick={onRefresh} loading={loading || false} />
              </div>
            )}
            <ClosePane
              onClick={clearGraphNodeSelection}
              className="garden-icon garden-icon--close"
            />
          </ClosePaneContainer>
        </div>

        <div className="row pt-2">
          <Key text="Type" />
          <div className="col-xs col-lg">
            {capitalize(type)}
          </div>
        </div>

        <div className="row pt-1">
          <Key text="Module" />
          <div className="col-xs col-lg">{moduleName}</div>
        </div>

        {duration && (
          <div className="row pt-1">
            <Key text="Duration" />
            <div className="col-xs col-lg">{duration}</div>
          </div>
        )}

        {startedAt && (
          <div className="row pt-1">
            <Key text="Started At" />
            <div className="col-xs col-lg">{startedAt}</div>
          </div>
        )}

        {completedAt && (
          <div className="row pt-1">
            <Key text="Completed At" />
            <div className="col-xs col-lg">{completedAt}</div>
          </div>
        )}

        {(type === "test" || type === "run") && (
          <div className="row pt-1">
            <div className="col-xs-12">
              {outputEl}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
