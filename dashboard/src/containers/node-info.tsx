/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"
import { DataContext } from "../context/data"
import { timeConversion } from "../util/helpers"
import { UiStateContext } from "../context/ui"
import { RenderedNode } from "garden-cli/src/config-graph"
import { InfoPane } from "../components/info-pane"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"
import { ErrorNotification } from "../components/notifications"

const ErrorMsg = ({ error, type }) => (
  <ErrorNotification>
    Error occured while trying to get {type} result: {error.message}
  </ErrorNotification>
)

export interface Props {
  node: RenderedNode
}

function prepareData(data: TestResultOutput | TaskResultOutput) {
  const duration =
    data.startedAt &&
    data.completedAt &&
    timeConversion(
      new Date(data.completedAt).valueOf() -
      new Date(data.startedAt).valueOf(),
    )
  const startedAt =
    data.startedAt &&
    new Date(data.startedAt).toLocaleString()

  const completedAt =
    data.completedAt &&
    new Date(data.completedAt).toLocaleString()

  const output = data.output

  return { duration, startedAt, completedAt, output }
}

/**
 * Returns the InfoPane for a given node type.
 *
 * If the node is of type "test" or "run", it loads the results as well.
 */
export const NodeInfo: React.FC<Props> = ({ node }) => {
  const { name, moduleName, type } = node
  const {
    actions: { loadTestResult, loadTaskResult },
    store: { testResult, taskResult },
  } = useContext(DataContext)
  const {
    actions: { clearGraphNodeSelection },
  } = useContext(UiStateContext)

  const loadResults = () => {
    if (type === "test") {
      loadTestResult({ name, module: moduleName }, true)
    } else if (type === "run") {
      loadTaskResult({ name }, true)
    }
  }

  useEffect(loadResults, [name, moduleName])

  // Here we just render the node data since only nodes of types test and run have results
  if (!(type === "test" || type === "run")) {
    return <InfoPane clearGraphNodeSelection={clearGraphNodeSelection} node={node} />
  }

  const result = type === "test" ? testResult : taskResult

  if (result.error) {
    return <ErrorMsg error={result.error} type={type} />
  }

  // Loading. Either data hasn't been loaded at all or cache contains stale data
  if (!result.data || result.data.name !== name) {
    return <InfoPane onRefresh={loadResults} clearGraphNodeSelection={clearGraphNodeSelection} node={node} />
  }

  // Render info pane with result data
  return (
    <InfoPane
      onRefresh={loadResults}
      loading={result.loading}
      clearGraphNodeSelection={clearGraphNodeSelection}
      node={node}
      {...prepareData(result.data)}
    />
  )
}
