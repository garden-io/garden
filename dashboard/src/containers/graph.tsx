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

  const isLoading = !config.data || !graph.data || config.loading || graph.loading
  const error = config.error || graph.error

  let moreInfoPane: JSX.Element | null = null
  if (selectedGraphNode && graph.data) {
    const node = graph.data.nodes.find(n => n.key === selectedGraphNode)
    if (node) {
      const { name, type, moduleName } = node
      switch (type) {
        case "run": // task
          moreInfoPane = <TaskResultNodeInfo name={name} />
          break
        case "test":
          moreInfoPane = <TestResultNodeInfo name={name} module={moduleName} />
          break
        case "build":
        default:
          moreInfoPane = null
          break
      }
    }
  }

  return (
    <LoadWrapper error={error} ErrorComponent={PageError} loading={isLoading}>
      <div className="row">
        <div className={moreInfoPane ? "col-xs-7" : "col-xs"}>
          {config.data && graph.data && <Graph
            message={message}
            selectGraphNode={selectGraphNode}
            selectedGraphNode={selectedGraphNode}
            config={config.data}
            graph={graph.data}
          />}
        </div>
        {moreInfoPane && (
          <div className="col-xs-5">{moreInfoPane}</div>
        )}
      </div>
    </LoadWrapper>
  )
}
