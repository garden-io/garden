/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { useState } from "react"
import React from "react"

import {
  fetchConfig,
  fetchLogs,
  fetchTaskResult,
  fetchStatus,
  fetchGraph,
  FetchLogsParam,
  FetchTaskResultParam,
  fetchTestResult,
  FetchTestResultParam,
} from "../api"
import {
  FetchConfigResponse,
  FetchStatusResponse,
  FetchGraphResponse,
  FetchLogsResponse,
  FetchTaskResultResponse,
  FetchTestResultResponse,
} from "../api/types"

interface StoreSlice {
  error: Error | null
  loading: boolean
}

interface Config extends StoreSlice {
  data: FetchConfigResponse | null
}
interface Status extends StoreSlice {
  data: FetchStatusResponse | null
}
interface Graph extends StoreSlice {
  data: FetchGraphResponse | null
}
interface Logs extends StoreSlice {
  data: FetchLogsResponse | null
}
interface TaskResult extends StoreSlice {
  data: FetchTaskResultResponse | null
}
interface TestResult extends StoreSlice {
  data: FetchTestResultResponse | null
}

// This is the global data store
interface Store {
  config: Config
  status: Status
  graph: Graph
  logs: Logs
  taskResult: TaskResult
  testResult: TestResult
}

export type LoadLogs = (param: FetchLogsParam, force?: boolean) => void
export type LoadTaskResult = (
  param: FetchTaskResultParam,
  force?: boolean,
) => void
export type LoadTestResult = (
  param: FetchTestResultParam,
  force?: boolean,
) => void

type Loader = (force?: boolean) => void

interface Actions {
  loadLogs: LoadLogs
  loadConfig: Loader
  loadStatus: Loader
  loadGraph: Loader
  loadTaskResult: LoadTaskResult
  loadTestResult: LoadTestResult
}

type KeyActionPair =
  |["config", (arg0?: any) => Promise<FetchConfigResponse>]
  | ["logs", (arg0?: any) => Promise<FetchLogsResponse>]
  | ["status", (arg0?: any) => Promise<FetchStatusResponse>]
  | ["taskResult", (arg0?: any) => Promise<FetchTaskResultResponse>]
  | ["testResult", (arg0?: any) => Promise<FetchTestResultResponse>]
  | ["graph", (arg0?: any) => Promise<FetchGraphResponse>]

type Context = {
  store: Store;
  actions: Actions;
}

type SliceName = keyof Store
const sliceNames: SliceName[] = [
  "config",
  "status",
  "graph",
  "logs",
  "taskResult",
  "testResult",
]

// TODO Fix type cast
const initialState: Store = sliceNames.reduce((acc, key) => {
  const state = { data: null, loading: false, error: null }
  acc[key] = state
  return acc
}, {}) as Store

// We type cast the initial value to avoid having to check whether the context exists in every context consumer.
// Context is only undefined if the provider is missing which we assume is not the case.
export const DataContext = React.createContext<Context>({} as Context)

// Updates slices of the store based on the slice key
function updateSlice(
  prevState: Store,
  key: SliceName,
  sliceState: Object,
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

// Creates the actions needed for fetching data from the API and updates the store state as the actions are called.
function useApi() {
  const [store, setData] = useState<Store>(initialState)

  const fetch = async ([key, fetchFn]: KeyActionPair, args?: any[]) => {
    setData(prevState => updateSlice(prevState, key, { loading: true }))

    try {
      const res = args ? await fetchFn(...args) : await fetchFn()
      setData(prevState => updateSlice(prevState, key, { data: res, error: null, loading: false }))
    } catch (error) {
      setData(prevState => updateSlice(prevState, key, { error, loading: false }))
    }
  }

  const fetchOrReadFromStore = (keyActionPair: KeyActionPair, force: boolean, args: any[] = []) => {
    const key = keyActionPair[0]
    const { data, loading } = store[key]
    if (!force && (data || loading)) {
      return
    }
    fetch(keyActionPair, args).catch(error =>
      setData(prevState => updateSlice(prevState, key, { error })),
    )
  }

  const loadLogs: LoadLogs = (args: FetchLogsParam, force: boolean = false) =>
    fetchOrReadFromStore(["logs", fetchLogs], force, [args])
  const loadConfig: Loader = (force: boolean = false) =>
    fetchOrReadFromStore(["config", fetchConfig], force)
  const loadGraph: Loader = (force: boolean = false) =>
    fetchOrReadFromStore(["graph", fetchGraph], force)
  const loadStatus: Loader = (force: boolean = false) =>
    fetchOrReadFromStore(["status", fetchStatus], force)

  const loadTaskResult: LoadTaskResult = (
    args: FetchTaskResultParam,
    force: boolean = false,
  ) => {
    return fetchOrReadFromStore(["taskResult", fetchTaskResult], force, [args])
  }

  const loadTestResult: LoadTestResult = (
    args: FetchTestResultParam,
    force: boolean = false,
  ) => {
    return fetchOrReadFromStore(["testResult", fetchTestResult], force, [args])
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

/**
 * This component manages the "rest" API data state (not the websockets) for the entire application.
 * We use the new React Hooks API to pass store data and actions down the component tree.
 */
export const DataProvider: React.SFC = ({ children }) => {
  const storeAndActions = useApi()

  return (
    <DataContext.Provider value={storeAndActions}>
      {children}
    </DataContext.Provider>
  )
}
