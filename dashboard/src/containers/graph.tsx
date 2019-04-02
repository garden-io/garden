/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"

import Graph from "../components/graph"
import PageError from "../components/page-error"
import { EventContext } from "../context/events"
import LoadWrapper from "../components/load-wrapper"
import { DataContext } from "../context/data"
import Card from "../components/card"
import { UiStateContext } from "../context/ui"
import Spinner from "../components/spinner"

export default () => {
  const {
    actions: { loadGraph, loadConfig },
    store: { config, graph },
  } = useContext(DataContext)
  const { message } = useContext(EventContext)

  useEffect(loadConfig, [])
  useEffect(loadGraph, [])

  const {
    actions: { selectGraphNode },
    state: { selectedGraphNode },
  } = useContext(UiStateContext)

  const isLoading = !config.data || !graph.data || config.loading || graph.loading
  const error = config.error || graph.error

  let paneEl = null
  if (selectedGraphNode !== null) {
    paneEl = <TestPane selectedGraphNode={selectedGraphNode} />
  }

  return (
    <LoadWrapper error={error} ErrorComponent={PageError} loading={isLoading}>
      {paneEl}
      <Graph message={message} selectGraphNode={selectGraphNode} config={config.data} graph={graph.data} />
    </LoadWrapper>
  )
}

interface PaneProps {
  selectedGraphNode: string
}

const TestPaneErrorMsg = () => <p>Error!</p>

const TestPaneSpinner = () => <Spinner fontSize="10px" />

const TestPane: React.SFC<PaneProps> = ({ selectedGraphNode }) => {
  const {
    actions: { loadTaskResults },
    store: { taskResults },
  } = useContext(DataContext)

  const [name, taskType] = selectedGraphNode.split(".")
  console.log(name, taskType)

  useEffect(loadTaskResults, [])

  console.log(taskResults)

  const isLoading = !taskResults.data || taskResults.loading

  return (
    <LoadWrapper
      loading={isLoading}
      error={taskResults.error}
      ErrorComponent={TestPaneErrorMsg}
      LoadComponent={TestPaneSpinner}>
      <Card>
        <div>
          <h1>Hello world</h1>
          <p>Data</p>
          {taskResults.data}
        </div>
      </Card>
    </LoadWrapper>
  )
}
