/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import React, { useState } from "react"

interface UiState {
  isSidebarOpen: boolean
  selectedGraphNode: string | null
}

export type SelectGraphNode = (node: string) => void

interface UiActions {
  toggleSidebar: () => void
  selectGraphNode: SelectGraphNode
  clearGraphNodeSelection: () => void
}

const INITIAL_UI_STATE: UiState = {
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

  const selectGraphNode = (node: string) => {
    setState({
      ...uiState,
      selectedGraphNode: node,
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
      selectGraphNode,
      clearGraphNodeSelection,
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
