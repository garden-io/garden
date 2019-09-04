/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState, useContext } from "react"
import { ServiceIngress } from "garden-service/build/src/types/service"
import { RenderedNodeType } from "garden-service/build/src/config-graph"
import { PickFromUnion } from "garden-service/build/src/util/util"

interface UiState {
  isSidebarOpen: boolean
  overview: {
    selectedIngress: ServiceIngress | null
    selectedEntity: SelectedEntity | null
    filters: {
      [key in OverviewSupportedFilterKeys]: boolean
    }
  }
  stackGraph: {
    filters: {
      [key in StackGraphSupportedFilterKeys]: boolean
    }
  }
  selectedGraphNode: string | null
}

export type SelectGraphNode = (node: string) => void
export type SelectEntity = (selectedEntity: SelectedEntity | null) => void
export type SelectIngress = (ingress: ServiceIngress | null) => void
export type OverviewSupportedFilterKeys =
  | "modules"
  | "modulesInfo"
  | "services"
  | "servicesInfo"
  | "tasks"
  | "tasksInfo"
  | "tests"
  | "testsInfo"
export type StackGraphSupportedFilterKeys = PickFromUnion<RenderedNodeType, "test" | "deploy" | "build" | "run">
export type EntityResultSupportedTypes = StackGraphSupportedFilterKeys | "task"
export type SelectedEntity = {
  type: EntityResultSupportedTypes
  name: string
  module: string
}

interface UiActions {
  toggleSidebar: () => void
  overviewToggleItemsView: (filterKey: OverviewSupportedFilterKeys) => void
  stackGraphToggleItemsView: (filterKey: StackGraphSupportedFilterKeys) => void
  selectGraphNode: SelectGraphNode
  selectEntity: SelectEntity
  selectIngress: SelectIngress
  clearGraphNodeSelection: () => void
}

const INITIAL_UI_STATE: UiState = {
  overview: {
    selectedIngress: null,
    selectedEntity: null,
    filters: {
      modules: true,
      modulesInfo: true,
      services: true,
      servicesInfo: true,
      tasks: true,
      tasksInfo: true,
      tests: true,
      testsInfo: true,
    },
  },
  stackGraph: {
    // todo: currently not attached to graph/index.tsx, use context there
    filters: {
      build: true,
      run: true,
      deploy: true,
      test: true,
    },
  },
  isSidebarOpen: true,
  selectedGraphNode: null,
}

interface UiStateAndActions {
  state: UiState
  actions: UiActions
}

// FIXME: Use useReducer instead of useState to simplify updating
const useUiStateProvider = () => {
  const [uiState, setState] = useState<UiState>(INITIAL_UI_STATE)

  const toggleSidebar = () => {
    setState({
      ...uiState,
      isSidebarOpen: !uiState.isSidebarOpen,
    })
  }

  const overviewToggleItemsView = (filterKey: OverviewSupportedFilterKeys) => {
    setState({
      ...uiState,
      overview: {
        ...uiState.overview,
        filters: {
          ...uiState.overview.filters,
          [filterKey]: !uiState.overview.filters[filterKey],
        },
      },
    })
  }

  const stackGraphToggleItemsView = (filterKey: StackGraphSupportedFilterKeys) => {
    setState({
      ...uiState,
      stackGraph: {
        ...uiState.stackGraph,
        filters: {
          ...uiState.stackGraph.filters,
          [filterKey]: !uiState.stackGraph.filters[filterKey],
        },
      },
    })
  }

  const selectGraphNode = (node: string) => {
    setState({
      ...uiState,
      selectedGraphNode: node,
    })
  }
  const selectIngress = (ingress: ServiceIngress | null) => {
    setState({
      ...uiState,
      overview: {
        ...uiState.overview,
        selectedIngress: ingress,
      },
    })
  }

  const selectEntity = (selectedEntity: SelectedEntity | null) => {
    setState({
      ...uiState,
      overview: {
        ...uiState.overview,
        selectedEntity,
      },
    })
  }

  const clearGraphNodeSelection = () => {
    setState({
      ...uiState,
      selectedGraphNode: null,
    })
  }

  return {
    state: uiState,
    actions: {
      toggleSidebar,
      overviewToggleItemsView,
      stackGraphToggleItemsView,
      selectGraphNode,
      clearGraphNodeSelection,
      selectIngress,
      selectEntity,
    },
  }
}

// Type cast the initial value to avoid having to check whether the context exists in every context consumer.
// Context is only undefined if the provider is missing which we assume is not the case.
const Context = React.createContext<UiStateAndActions>({} as UiStateAndActions)

/**
 * Returns the state and UI actions via the Context
 */
export const useUiState = () => useContext(Context)

export const UiStateProvider: React.FC = ({ children }) => {
  const storeAndActions = useUiStateProvider()

  return <Context.Provider value={storeAndActions}>{children}</Context.Provider>
}
