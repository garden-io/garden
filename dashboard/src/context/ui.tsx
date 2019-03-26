import React, { useState } from "react";

interface UiState {
  isSidebarOpen: boolean
}

interface UiActions {
  toggleSidebar: () => void
}

const INITIAL_UI_STATE: UiState = {
  isSidebarOpen: false,
}

interface UiStateAndActions {
  state: UiState,
  actions: UiActions,
}

export const UiStateContext = React.createContext<UiStateAndActions>(null)

const useUiState = () => {
  const [uiState, setState] = useState<UiState>(INITIAL_UI_STATE)

  const toggleSidebar = () => {
    setState({
      ...uiState,
      isSidebarOpen: !uiState.isSidebarOpen,
    })
  }

  return {
    state: uiState,
    actions: {
      toggleSidebar,
    },
  }
}

export const UiStateProvider: React.SFC = ({ children }) => {
  const storeAndActions = useUiState()

  return (
    <UiStateContext.Provider value={storeAndActions}>
      {children}
    </UiStateContext.Provider>
  )
}
