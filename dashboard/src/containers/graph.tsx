/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useContext, useEffect } from "react"
import styled from "@emotion/styled"
import Graph from "../components/graph"
import PageError from "../components/page-error"
import { EventContext } from "../context/events"
import { DataContext } from "../context/data"
import { UiStateContext, StackGraphSupportedFilterKeys } from "../context/ui"
import { NodeInfo } from "./node-info"
import Spinner from "../components/spinner"
import { Filters } from "../components/group-filter"
import { capitalize } from "lodash"

const Wrapper = styled.div`
padding-left: .75rem;
`

export default () => {
  const {
    actions: { loadGraph, loadConfig },
    store: { config, graph },
  } = useContext(DataContext)
  const { message } = useContext(EventContext)

  useEffect(loadConfig, [])
  useEffect(loadGraph, [])

  const {
    actions: { selectGraphNode, stackGraphToggleItemsView },
    state: { selectedGraphNode, isSidebarOpen, stackGraph: { filters } },
  } = useContext(UiStateContext)

  if (config.error || graph.error) {
    return <PageError error={config.error || graph.error} />
  }

  if (!config.data || !graph.data || config.loading || graph.loading) {
    return <Spinner />
  }
  if (message && message.type === "event") {
    const nodeToUpdate = graph.data.nodes.find(node => node.key === (message.payload && message.payload["key"]))
    if (nodeToUpdate) {
      nodeToUpdate.status = message.name
      graph.data = { ...graph.data }
    }
  }

  let moreInfoPane: React.ReactNode = null
  if (selectedGraphNode && graph.data) {
    const node = graph.data.nodes.find(n => n.key === selectedGraphNode)
    if (node) {
      moreInfoPane = (
        <div className="col-xs-5 col-sm-5 col-md-4 col-lg-4 col-xl-4">
          <NodeInfo node={node} />
        </div>
      )
    }
  }

  const createFiltersState =
    (allGroupFilters, type): Filters<StackGraphSupportedFilterKeys> => {
      return ({
        ...allGroupFilters,
        [type]: {
          label: capitalize(type),
          selected: filters[type],
        },
      })
    }

  const graphFilters = Object.keys(filters).reduce(createFiltersState, {}) as Filters<StackGraphSupportedFilterKeys>

  return (
    <Wrapper className="row">
      <div className={moreInfoPane ? "col-xs-7 col-sm-7 col-md-8 col-lg-8 col-xl-8" : "col-xs"}>
        <Graph
          onGraphNodeSelected={selectGraphNode}
          selectedGraphNode={selectedGraphNode}
          layoutChanged={isSidebarOpen}
          config={config.data}
          graph={graph.data}
          filters={graphFilters}
          onFilter={stackGraphToggleItemsView}
        />
      </div>
      {moreInfoPane}
    </Wrapper>
  )
}
