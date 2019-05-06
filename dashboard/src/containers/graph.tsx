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
import { DataContext } from "../context/data"
import { UiStateContext } from "../context/ui"
import { NodeInfo } from "./node-info"
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

  if (config.error || graph.error) {
    return <PageError />
  }

  if (!config.data || !graph.data || config.loading || graph.loading) {
    return <Spinner />
  }

  let moreInfoPane: React.ReactNode = null
  if (selectedGraphNode && graph.data) {
    const node = graph.data.nodes.find(n => n.key === selectedGraphNode)
    if (node) {
      moreInfoPane = (
        <div className="col-xs-5">
          <NodeInfo node={node} />
        </div>
      )
    }
  }

  return (
    <div className="row">
      <div className={moreInfoPane ? "col-xs-7" : "col-xs"}>
        <Graph
          message={message}
          onGraphNodeSelected={selectGraphNode}
          selectedGraphNode={selectedGraphNode}
          config={config.data}
          graph={graph.data}
        />
      </div>
      {moreInfoPane}
    </div>
  )
}
