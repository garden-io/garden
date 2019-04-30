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
  fetchStatus,
  fetchGraph,
  FetchLogsParam,
  FetchTaskResultParam,
  FetchTestResultParam,
  fetchTaskResult,
  fetchTestResult,
} from "../api/api"
import { ServiceLogEntry } from "garden-cli/src/types/plugin/outputs"
import { ConfigDump } from "garden-cli/src/garden"
import { GraphOutput } from "garden-cli/src/commands/get/get-graph"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { EnvironmentStatus } from "garden-cli/src/actions"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"

interface StoreCommon {
  error: Error | null
  loading: boolean
}

// This is the global data store
interface Store {
  config: StoreCommon & {
    data?: ConfigDump,
  },
  status: StoreCommon & {
    data?: EnvironmentStatus,
  },
  graph: StoreCommon & {
    data?: GraphOutput,
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

const initialState: Store = storeKeys.reduce<Store>((acc, key) => {
  const state = { loading: false, error: null }
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
 * Creates the actions needed for fetching data from the API and updates the store state as the actions are called.
 *
 * TODO: Improve type safety
 */
function useApi() {
  const [store, setData] = useState(initialState)

  const fetch = async (key: StoreKey, fetchFn: Function, args?: any[]) => {
    setData(prevState => updateSlice(prevState, key, { loading: true }))

    try {
      const res = args ? await fetchFn(...args) : await fetchFn()
      setData(prevState => updateSlice(prevState, key, { data: res, error: null, loading: false }))
    } catch (error) {
      setData(prevState => updateSlice(prevState, key, { error, loading: false }))
    }
  }

  const fetchOrReadFromStore = <T extends Function>(key: StoreKey, action: T, force: boolean, args: any[] = []) => {
    const { data, loading } = store[key]
    if (!force && (data || loading)) {
      return
    }
    fetch(key, action, args).catch(error => setData(prevState => updateSlice(prevState, key, { error })))
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
