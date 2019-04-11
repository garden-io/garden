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
import { UiStateContext } from "../context/ui"
import { TaskResultNodeInfo } from "./task-result-node-info"
import { TestResultNodeInfo } from "./test-result-node-info"

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

  const isLoading =
    !config.data || !graph.data || config.loading || graph.loading
  const error = config.error || graph.error

<<<<<<< HEAD
  let moreInfoPane
  if (selectedGraphNode) {
    const { name, type, moduleName } = graph.data.nodes.find(
      node => node.key === selectedGraphNode,
    )
    switch (type) {
=======
  let moreInfoPane = null
  if (selectedGraphNode) {
    const [name, taskType] = selectedGraphNode.split(".") // TODO: replace with extracting this data from hashmap
    switch (taskType) {
>>>>>>> 96dfd2e0b269263b33e030bc9a8e1811f9de8d13
      case "run": // task
        moreInfoPane = <TaskResultNodeInfo name={name} />
        break
      case "test":
<<<<<<< HEAD
        moreInfoPane = <TestResultNodeInfo name={name} module={moduleName} />
        break
      case "build":
      default:
        moreInfoPane = null
=======
        moreInfoPane = <TestResultNodeInfo name={"unit"} module={"hello"} />
        break
      case "build":
      default:
>>>>>>> 96dfd2e0b269263b33e030bc9a8e1811f9de8d13
        break
    }
  }

  return (
    <LoadWrapper error={error} ErrorComponent={PageError} loading={isLoading}>
      <div className="row">
<<<<<<< HEAD
        <div className={moreInfoPane ? "col-xs-7" : "col-xs"}>
=======
        <div className={moreInfoPane !== null ? "col-xs-8" : "col-xs"}>
>>>>>>> 96dfd2e0b269263b33e030bc9a8e1811f9de8d13
          <Graph
            message={message}
            selectGraphNode={selectGraphNode}
            config={config.data}
            graph={graph.data}
          />
        </div>

<<<<<<< HEAD
        {moreInfoPane && (
          <div className="col-xs-5">{moreInfoPane}</div>
=======
        {moreInfoPane !== null && (
          <div className="col-xs-4">{moreInfoPane}</div>
>>>>>>> 96dfd2e0b269263b33e030bc9a8e1811f9de8d13
        )}
      </div>
    </LoadWrapper>
  )
}
