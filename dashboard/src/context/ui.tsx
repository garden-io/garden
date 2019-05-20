/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState } from "react"
import { ServiceIngress } from "garden-cli/src/types/service"
import { RenderedNodeType } from "garden-cli/src/config-graph"

interface UiState {
  isSidebarOpen: boolean
  overview: {
    selectedIngress: ServiceIngress | null,
    filters: {
      [key in OverviewSupportedFilterKeys]: boolean
    },
  },
  stackGraph: {
    filters: {
      [key in StackGraphSupportedFilterKeys]: boolean
    },
  },
  selectedGraphNode: string | null,
}

export type SelectGraphNode = (node: string) => void
export type SelectIngress = (ingress: ServiceIngress | null) => void

export type OverviewSupportedFilterKeys = "modules" | "modulesInfo" | "services" | "servicesInfo" |
  "tasks" | "tasksInfo" | "tests" | "testsInfo"
export type StackGraphSupportedFilterKeys = Exclude<RenderedNodeType, "publish">

interface UiActions {
  toggleSidebar: () => void
  overviewToggleItemsView: (itemToToggle: OverviewSupportedFilterKeys) => void
  selectGraphNode: SelectGraphNode
  selectIngress: SelectIngress
  clearGraphNodeSelection: () => void
}

const INITIAL_UI_STATE: UiState = {
  overview: {
    selectedIngress: null,
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
  stackGraph: { // todo: currently not attached to graph/index.tsx, use context there
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
  state: UiState,
  actions: UiActions,
}

export const UiStateContext = React.createContext<UiStateAndActions>({} as UiStateAndActions)

const useUiState = () => {
  const [uiState, setState] = useState<UiState>(INITIAL_UI_STATE)

  const toggleSidebar = () => {
    setState({
      ...uiState,
      isSidebarOpen: !uiState.isSidebarOpen,
    })
  }

  const overviewToggleItemsView = (itemToToggle: OverviewSupportedFilterKeys) => {
    setState({
      ...uiState,
      overview: {
        ...uiState.overview,
        filters: {
          ...uiState.overview.filters,
          [itemToToggle]: !uiState.overview.filters[itemToToggle],
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
      selectGraphNode,
      clearGraphNodeSelection,
      selectIngress,
    },
  }
}

export const UiStateProvider: React.FC = ({ children }) => {
  const storeAndActions = useUiState()

  return (
    <UiStateContext.Provider value={storeAndActions}>
      {children}
    </UiStateContext.Provider>
  )
}
