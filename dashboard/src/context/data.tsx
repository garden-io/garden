/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { useReducer } from "react"
import React from "react"

import {
  fetchConfig,
  fetchLogs,
  fetchStatus,
  fetchGraph,
  FetchLogsParam,
  FetchTaskResultParam,
  FetchTestResultParam,
  fetchTaskResult,
  fetchTestResult,
} from "../api/api"
import { ServiceLogEntry } from "garden-cli/src/types/plugin/service/getServiceLogs"
import { ConfigDump } from "garden-cli/src/garden"
import { GraphOutput } from "garden-cli/src/commands/get/get-graph"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { StatusCommandResult } from "garden-cli/src/commands/get/get-status"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"
import { AxiosError } from "axios"
import { RenderedNode } from "garden-cli/src/config-graph"
import { SupportedEventName } from "./events"

interface StoreCommon {
  error?: AxiosError
  loading: boolean
}

export interface RenderedNodeWithStatus extends RenderedNode {
  status?: SupportedEventName
}
export interface GraphOutputWithNodeStatus extends GraphOutput {
  nodes: RenderedNodeWithStatus[],
}

// This is the global data store
interface Store {
  config: StoreCommon & {
    data?: ConfigDump,
  },
  status: StoreCommon & {
    data?: StatusCommandResult,
  },
  graph: StoreCommon & {
    data?: GraphOutputWithNodeStatus,
  },
  logs: StoreCommon & {
    data?: ServiceLogEntry[],
  },
  taskResult: StoreCommon & {
    data?: TaskResultOutput,
  },
  testResult: StoreCommon & {
    data?: TestResultOutput,
  },
}

type Context = {
  store: Store;
  actions: Actions;
}

type StoreKey = keyof Store
const storeKeys: StoreKey[] = [
  "config",
  "status",
  "graph",
  "logs",
  "taskResult",
  "testResult",
]

interface ActionBase {
  type: "fetchStart" | "fetchSuccess" | "fetchFailure"
  key: StoreKey
}

interface ActionStart extends ActionBase {
  type: "fetchStart"
}

interface ActionSuccess extends ActionBase {
  type: "fetchSuccess"
  data: any
}

interface ActionError extends ActionBase {
  type: "fetchFailure"
  error: AxiosError
}

type Action = ActionStart | ActionError | ActionSuccess

export type LoadLogs = (param: FetchLogsParam, force?: boolean) => void
export type LoadTaskResult = (param: FetchTaskResultParam, force?: boolean) => void
export type LoadTestResult = (param: FetchTestResultParam, force?: boolean) => void

type Loader = (force?: boolean) => void
interface Actions {
  loadLogs: LoadLogs
  loadConfig: Loader
  loadStatus: Loader
  loadGraph: Loader
  loadTaskResult: LoadTaskResult
  loadTestResult: LoadTestResult
}

const initialState: Store = storeKeys.reduce<Store>((acc, key) => {
  const state = { loading: false }
  acc[key] = state
  return acc
}, {} as Store)

/**
 * Updates slices of the store based on the slice key
 */
function updateSlice(
  prevState: Store,
  key: StoreKey,
  sliceState: Partial<Store[StoreKey]>,
): Store {
  const prevSliceState = prevState[key]
  return {
    ...prevState,
    [key]: {
      ...prevSliceState,
      ...sliceState,
    },
  }
}

/**
 * The reducer for the useApi hook. Sets the state for a given slice of the store on fetch events.
 */
function reducer(store: Store, action: Action) {
  switch (action.type) {
    case "fetchStart":
      return updateSlice(store, action.key, { loading: true, error: undefined })
    case "fetchSuccess":
      return updateSlice(store, action.key, { loading: false, data: action.data, error: undefined })
    case "fetchFailure":
      return updateSlice(store, action.key, { loading: false, error: action.error })
  }
}

/**
 * Creates the actions needed for fetching data from the API and updates the store state as the actions are called.
 *
 * TODO: Improve type safety
 */
function useApi() {
  const [store, dispatch] = useReducer(reducer, initialState)

  const fetch = async (key: StoreKey, fetchFn: Function, args?: any[]) => {
    dispatch({ key, type: "fetchStart" })

    try {
      const res = args ? await fetchFn(...args) : await fetchFn()
      dispatch({ key, type: "fetchSuccess", data: res })
    } catch (error) {
      dispatch({ key, error, type: "fetchFailure" })
    }
  }

  const fetchOrReadFromStore = <T extends Function>(key: StoreKey, action: T, force: boolean, args: any[] = []) => {
    const { data, loading } = store[key]
    if (!force && (data || loading)) {
      return
    }
    fetch(key, action, args).catch(error => dispatch({ key, error, type: "fetchFailure" }))
  }

  const loadLogs: LoadLogs = (args: FetchLogsParam, force: boolean = false) => (
    fetchOrReadFromStore("logs", fetchLogs, force, [args])
  )
  const loadConfig: Loader = (force: boolean = false) => (
    fetchOrReadFromStore("config", fetchConfig, force)
  )
  const loadGraph: Loader = (force: boolean = false) => (
    fetchOrReadFromStore("graph", fetchGraph, force)
  )
  const loadStatus: Loader = (force: boolean = false) => (
    fetchOrReadFromStore("status", fetchStatus, force)
  )
  const loadTaskResult: LoadTaskResult = (args: FetchTaskResultParam, force: boolean = false) => {
    return fetchOrReadFromStore("taskResult", fetchTaskResult, force, [args])
  }
  const loadTestResult: LoadTestResult = (args: FetchTestResultParam, force: boolean = false) => {
    return fetchOrReadFromStore("testResult", fetchTestResult, force, [args])
  }

  return {
    store,
    actions: {
      loadConfig,
      loadLogs,
      loadGraph,
      loadStatus,
      loadTaskResult,
      loadTestResult,
    },
  }
}

// We type cast the initial value to avoid having to check whether the context exists in every context consumer.
// Context is only undefined if the provider is missing which we assume is not the case.
export const DataContext = React.createContext<Context>({} as Context)

/**
 * This component manages the "rest" API data state (not the websockets) for the entire application.
 * We use the new React Hooks API to pass store data and actions down the component tree.
 */
export const DataProvider: React.FC = ({ children }) => {
  const storeAndActions = useApi()

  return (
    <DataContext.Provider value={storeAndActions}>
      {children}
    </DataContext.Provider>
  )
}
