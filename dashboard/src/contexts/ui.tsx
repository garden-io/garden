/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState } from "react"
import produce from "immer"
import { ServiceIngress } from "@garden-io/core/build/src/types/service"
import { DependencyGraphNodeType } from "@garden-io/core/build/src/config-graph"
import { PickFromUnion } from "@garden-io/core/build/src/util/util"

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
  modal: {
    visible: boolean
    content: React.ReactNode
  }
  infoBox: {
    visible: boolean
    content: React.ReactNode
  }
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
export type StackGraphSupportedFilterKeys = PickFromUnion<DependencyGraphNodeType, "test" | "deploy" | "build" | "run">
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
  showModal: (content: React.ReactNode) => void
  hideModal: () => void
  showInfoBox: (content: React.ReactNode) => void
  hideInfoBox: () => void
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
  modal: {
    visible: false,
    content: null,
  },
  infoBox: {
    visible: false,
    content: null,
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
    setState(
      produce(uiState, (draft) => {
        draft.isSidebarOpen = !uiState.isSidebarOpen
      })
    )
  }

  const overviewToggleItemsView = (filterKey: OverviewSupportedFilterKeys) => {
    setState(
      produce(uiState, (draft) => {
        draft.overview.filters[filterKey] = !uiState.overview.filters[filterKey]
      })
    )
  }

  const stackGraphToggleItemsView = (filterKey: StackGraphSupportedFilterKeys) => {
    setState(
      produce(uiState, (draft) => {
        draft.stackGraph.filters[filterKey] = !uiState.stackGraph.filters[filterKey]
      })
    )
  }

  const selectGraphNode = (node: string) => {
    setState(
      produce(uiState, (draft) => {
        draft.selectedGraphNode = node
      })
    )
  }
  const selectIngress = (ingress: ServiceIngress | null) => {
    setState(
      produce(uiState, (draft) => {
        draft.overview.selectedIngress = ingress
      })
    )
  }

  const selectEntity = (selectedEntity: SelectedEntity | null) => {
    setState(
      produce(uiState, (draft) => {
        draft.overview.selectedIngress = null
        draft.overview.selectedEntity = selectedEntity
      })
    )
  }

  const clearGraphNodeSelection = () => {
    setState(
      produce(uiState, (draft) => {
        draft.selectedGraphNode = null
      })
    )
  }

  const showModal = (content: React.ReactNode) => {
    setState(
      produce(uiState, (draft) => {
        draft.modal = {
          content,
          visible: true,
        }
      })
    )
  }

  const hideModal = () => {
    setState(
      produce(uiState, (draft) => {
        draft.modal = {
          content: null,
          visible: false,
        }
      })
    )
  }

  const showInfoBox = (content: React.ReactNode) => {
    setState(
      produce(uiState, (draft) => {
        draft.infoBox = {
          content,
          visible: true,
        }
      })
    )
  }

  const hideInfoBox = () => {
    setState(
      produce(uiState, (draft) => {
        draft.infoBox = {
          content: null,
          visible: false,
        }
      })
    )
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
      showModal,
      hideModal,
      showInfoBox,
      hideInfoBox,
    },
  }
}

// Type cast the initial value to avoid having to check whether the context exists in every context consumer.
// Context is only undefined if the provider is missing which we assume is not the case.
export const UiContext = React.createContext<UiStateAndActions>({} as UiStateAndActions)

export const UiStateProvider: React.FC = ({ children }) => {
  const storeAndActions = useUiStateProvider()

  return <UiContext.Provider value={storeAndActions}>{children}</UiContext.Provider>
}
