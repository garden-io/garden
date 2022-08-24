/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useEffect } from "react"
import styled from "@emotion/styled"
import { StackGraph } from "../components/graph"
import PageError from "../components/page-error"
import { TaskState } from "../contexts/api"
import EntityResult from "./entity-result"
import Spinner from "../components/spinner"
import { Filters } from "../components/group-filter"
import { capitalize } from "lodash"
import { RenderedNode } from "../../../core/build/src/graph/config-graph"
import type { GraphOutput } from "@garden-io/core/build/src/commands/get/get-graph"
import { loadGraph } from "../api/actions"
import { useApi, useUiState } from "../hooks"
import { colors } from "../styles/variables"
import type { ActionKind } from "@garden-io/core/src/plugin/action-types"

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  background-color: ${colors.gardenWhite};
`

const cardStyle = {
  position: "absolute",
  top: "0",
  right: "1.5rem",
  minWidth: "20rem",
  maxWidth: "35rem",
  maxHeight: "calc(100vh - 8rem)",
  overflowY: "auto",
}

export interface StackGraphNode extends RenderedNode {
  status?: TaskState
  disabled: boolean
}
export interface GraphOutputWithNodeStatus extends GraphOutput {
  nodes: StackGraphNode[]
}

export default () => {
  const {
    dispatch,
    store: { entities, requestStates },
  } = useApi()

  const { project, actions, graph } = entities

  const {
    actions: { selectGraphNode, stackGraphToggleItemsView, clearGraphNodeSelection },
    state: {
      selectedGraphNode,
      stackGraph: { filters },
    },
  } = useUiState()

  useEffect(() => {
    const fetchData = async () => loadGraph(dispatch)

    if (!requestStates.graph.initLoadComplete) {
      fetchData()
    }
  }, [dispatch, requestStates.graph.initLoadComplete])

  if (requestStates.graph.error) {
    return <PageError error={requestStates.graph.error} />
  }

  if (!requestStates.graph.initLoadComplete) {
    return <Spinner />
  }

  const nodesWithStatus: StackGraphNode[] = graph.nodes.map((node) => {
    const action = actions[node.kind][node.name]
    const taskState = action.taskState
    const disabled = action.config.disabled || false
    return { ...node, disabled, status: taskState }
  })

  let graphWithStatus: GraphOutputWithNodeStatus = { nodes: nodesWithStatus, relationships: graph.relationships }

  let moreInfoPane: React.ReactNode = null
  if (selectedGraphNode && graph) {
    const node = graph.nodes.find((n) => n.key === selectedGraphNode)
    if (node) {
      moreInfoPane = (
        <EntityResult
          name={node.name}
          kind={node.kind as ActionKind}
          moduleName={node.moduleName}
          onClose={clearGraphNodeSelection}
          cardProps={{ style: cardStyle }}
        />
      )
    }
  }

  const graphFilters = Object.keys(filters).reduce((allGroupFilters, type) => {
    return {
      ...allGroupFilters,
      [type]: {
        label: capitalize(type),
        selected: filters[type],
      },
    }
  }, {}) as Filters<ActionKind>

  return (
    <Wrapper>
      <StackGraph
        onGraphNodeSelected={selectGraphNode}
        selectedGraphNode={selectedGraphNode}
        graph={graphWithStatus}
        filters={graphFilters}
        onFilter={stackGraphToggleItemsView}
        isProcessing={project.taskGraphProcessing}
      />
      {moreInfoPane}
    </Wrapper>
  )
}
