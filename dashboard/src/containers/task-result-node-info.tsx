/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"
import cls from "classnames"
import { css } from "emotion/macro"
import styled from "@emotion/styled/macro"
import LoadWrapper from "../components/load-wrapper"
import { DataContext } from "../context/data"
import Card from "../components/card"
import Spinner from "../components/spinner"
import { colors } from "../styles/variables"
import { timeConversion } from "../util/helpers"
import { UiStateContext } from "../context/ui"

const TaskPaneErrorMsg = ({ error }) => (
  <NoResults>
    Error occured while trying to get task result: {error.message}
  </NoResults>
)
const TaskPaneSpinner = () => <Spinner fontSize="3px" />

const Term = styled.div`
  background-color: ${colors.gardenBlack};
  color: white;
  border-radius: 2px;
  max-height: 45rem;
  overflow-y: auto;
  padding: 1rem;
`
const Code = styled.code`
  word-break: break-word;
`

const NoResults = styled.div`
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
  position: relative;
  padding: 0.75rem 1.25rem;
  border: 1px solid transparent;
  border-radius: 0.25rem;
`
const ClosePaneContainer = styled.div`
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
  background-size: 3rem;
  background-position: center;
`

interface TaskResultInfo {
  name: string
  module: string
  output: string | null
  startedAt: string | null
  completedAt: string | null
  duration: string
}

export const TaskResultNodeInfo: React.SFC<TaskResultNodeInfoProps> = ({
  name,
}) => {
  const {
    actions: { loadTaskResult },
    store: { taskResult },
  } = useContext(DataContext)

  const {
    actions: { clearGraphNodeSelection },
  } = useContext(UiStateContext)

  useEffect(() => loadTaskResult({ name }, true), [name])
  const isLoading = !taskResult.data || taskResult.loading

  let info: TaskResultInfo = null

  if (!isLoading && taskResult.data) {
    info = {
      name,
      module: taskResult.data.module,
      duration:
        taskResult.data.startedAt &&
        taskResult.data.completedAt &&
        timeConversion(
          new Date(taskResult.data.completedAt).valueOf() -
          new Date(taskResult.data.startedAt).valueOf(),
        ),
      startedAt:
        taskResult.data.startedAt &&
        new Date(taskResult.data.startedAt).toLocaleString(),
      completedAt:
        taskResult.data.completedAt &&
        new Date(taskResult.data.completedAt).toLocaleString(),
      output: taskResult.data.output,
    }
  }

  return (
    <LoadWrapper
      loading={isLoading}
      error={taskResult.error}
      ErrorComponent={TaskPaneErrorMsg}
      LoadComponent={TaskPaneSpinner}
    >
      {info && (
        <Card>
          <div className="p-1">
            <div className="row">
              <div>
                <IconContainer
                  className={cls(`garden-icon`, `garden-icon--run`)}
                />
              </div>
              <div
                className={css`
                  padding-left: 0.5rem;
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
                <ClosePane
                  onClick={clearGraphNodeSelection}
                  className="garden-icon garden-icon--close"
                />
              </ClosePaneContainer>
            </div>

            <div className="row pt-2">
              <div className="col-xs-5 col-lg-3 pr-1">Type:</div>
              <div className="col-xs col-lg">
                Run
              </div>
            </div>

            {info.module && (
              <div className="row pt-1">
                <div className="col-xs-5 col-lg-3 pr-1">Module:</div>
                <div className="col-xs col-lg">{info.module}</div>
              </div>
            )}

            {info.duration && (
              <div className="row pt-1">
                <div className="col-xs-5 col-lg-3 pr-1">Duration:</div>
                <div className="col-xs col-lg">{info.duration}</div>
              </div>
            )}

            {info.startedAt && (
              <div className="row pt-1">
                <div className="col-xs-5 col-lg-3 pr-1">Started at:</div>
                <div className="col-xs col-lg">{info.startedAt}</div>
              </div>
            )}
            {info.completedAt && (
              <div className="row pt-1">
                <div className="col-xs-5 col-lg-3 pr-1">Completed at:</div>
                <div className="col-xs col-lg">{info.completedAt}</div>
              </div>
            )}

            <div className="row pt-1">
              <div className="col-xs-12 pb-1">Output:</div>
              <div className="col-xs-12">
                {info.output ? (
                  <Term>
                    <Code>{info.output}</Code>
                  </Term>
                ) : (
                    <NoResults>No task output.</NoResults>
                  )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </LoadWrapper>
  )
}

export interface TaskResultNodeInfoProps {
  name: string // task name
}
