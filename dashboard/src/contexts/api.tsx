/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { useReducer, useEffect, useContext } from "react"
import React from "react"
import produce from "immer"
import { AxiosError } from "axios"

import { ServiceLogEntry } from "garden-service/build/src/types/plugin/service/getServiceLogs"
import { GraphOutput } from "garden-service/build/src/commands/get/get-graph"
import { ServiceStatus } from "garden-service/build/src/types/service"
import { ModuleConfig } from "garden-service/build/src/config/module"
import { PickFromUnion } from "garden-service/build/src/util/util"
import { ServiceConfig } from "garden-service/build/src/config/service"
import { RunStatus } from "garden-service/build/src/commands/get/get-status"
import { TaskConfig } from "garden-service/build/src/config/task"
import { TaskResultOutput } from "garden-service/build/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-service/build/src/commands/get/get-test-result"
import { TestConfig } from "garden-service/build/src/config/test"
import { EventName } from "garden-service/build/src/events"
import { EnvironmentStatusMap } from "garden-service/build/src/types/plugin/provider/getEnvironmentStatus"
import {
  loadLogsHandler,
  loadStatusHandler,
  loadTaskResultHandler,
  loadConfigHandler,
  loadTestResultHandler,
  loadGraphHandler,
} from "./api-handlers"
import {
  FetchLogsParams,
  FetchTaskResultParams,
  FetchTestResultParams,
} from "../api/api"
import { initWebSocket } from "./ws-handlers"

export type SupportedEventName = PickFromUnion<EventName,
  "taskPending" |
  "taskProcessing" |
  "taskComplete" |
  "taskGraphComplete" |
  "taskError" |
  "taskCancelled"
>

export const supportedEventNames: Set<SupportedEventName> = new Set([
  "taskPending",
  "taskProcessing",
  "taskComplete",
  "taskGraphComplete",
  "taskError",
  "taskCancelled",
])

export type TaskState = PickFromUnion<SupportedEventName,
  "taskComplete" |
  "taskError" |
  "taskPending" |
  "taskProcessing" |
  "taskCancelled"
>

export interface Test {
  config: TestConfig,
  status: RunStatus,
  result: TestResultOutput,
  taskState: TaskState, // State of the test task for the module
}

export interface Task {
  config: TaskConfig,
  status: RunStatus,
  result: TaskResultOutput,
  taskState: TaskState, // State of the task task for the module
}

export type Module = Pick<ModuleConfig,
  "name" |
  "type" |
  "path" |
  "repositoryUrl" |
  "description"
> & {
  services: string[],
  tasks: string[],
  tests: string[],
  taskState: TaskState, // State of the build task for the module
}

export interface Service {
  config: ServiceConfig,
  status: ServiceStatus,
  taskState: TaskState, // State of the deploy task for the service
}

interface RequestState {
  loading: boolean,
  initLoadComplete: boolean
  error?: AxiosError,
}

/**
 * The "global" data store
 */
export interface Store {
  projectRoot: string,
  entities: {
    modules: { [moduleName: string]: Module }
    services: { [serviceName: string]: Service }
    tasks: { [taskName: string]: Task }
    tests: { [testKey: string]: Test }
    logs: { [serviceName: string]: ServiceLogEntry[] }
    graph: GraphOutput,
    providers: EnvironmentStatusMap,
  },
  requestStates: {
    fetchConfig: RequestState
    fetchStatus: RequestState
    fetchGraph: RequestState,
    fetchLogs: RequestState,
    fetchTestResult: RequestState,
    fetchTaskResult: RequestState,
    fetchTaskStates: RequestState, // represents stack graph web sockets connection
  },
}

type RequestKey = keyof Store["requestStates"]
const requestKeys: RequestKey[] = [
  "fetchConfig",
  "fetchStatus",
  "fetchLogs",
  "fetchTestResult",
  "fetchTaskResult",
  "fetchGraph",
  "fetchTaskStates",
]

type ProduceNextStore = (store: Store) => Store

interface ActionBase {
  type: "fetchStart" | "fetchSuccess" | "fetchFailure" | "wsMessageReceived"
}

interface ActionStart extends ActionBase {
  requestKey: RequestKey
  type: "fetchStart"
}

interface ActionSuccess extends ActionBase {
  requestKey: RequestKey
  type: "fetchSuccess"
  produceNextStore: ProduceNextStore
}

interface ActionError extends ActionBase {
  requestKey: RequestKey
  type: "fetchFailure"
  error: AxiosError
}

interface WsMessageReceived extends ActionBase {
  type: "wsMessageReceived"
  produceNextStore: ProduceNextStore
}

export type Action = ActionStart | ActionError | ActionSuccess | WsMessageReceived

interface LoadActionParams {
  force?: boolean
}
type LoadAction = (param?: LoadActionParams) => Promise<void>

interface LoadLogsParams extends LoadActionParams, FetchLogsParams { }
export type LoadLogs = (param: LoadLogsParams) => Promise<void>

interface LoadTaskResultParams extends LoadActionParams, FetchTaskResultParams { }
type LoadTaskResult = (param: LoadTaskResultParams) => Promise<void>

interface LoadTestResultParams extends LoadActionParams, FetchTestResultParams { }
type LoadTestResult = (param: LoadTestResultParams) => Promise<void>

interface Actions {
  loadLogs: LoadLogs
  loadTaskResult: LoadTaskResult
  loadTestResult: LoadTestResult
  loadConfig: LoadAction
  loadStatus: LoadAction
  loadGraph: LoadAction
}

const initialRequestState = requestKeys.reduce((acc, key) => {
  acc[key] = { loading: false, initLoadComplete: false }
  return acc
}, {} as { [K in RequestKey]: RequestState })

const initialState: Store = {
  projectRoot: "",
  entities: {
    modules: {},
    services: {},
    tasks: {},
    tests: {},
    logs: {},
    graph: { nodes: [], relationships: [] },
    providers: {},
  },
  requestStates: initialRequestState,
}

/**
 * The reducer for the useApiProvider hook. Sets the state for a given slice of the store on fetch events.
 */
function reducer(store: Store, action: Action): Store {
  let nextStore: Store = store

  switch (action.type) {
    case "fetchStart":
      nextStore = produce(store, storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = true
      })
      break
    case "fetchSuccess":
      // Produce the next store state from the fetch result and update the request state
      nextStore = produce(action.produceNextStore(store), storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = false
        storeDraft.requestStates[action.requestKey].initLoadComplete = true
      })
      break
    case "fetchFailure":
      nextStore = produce(store, storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = false
        storeDraft.requestStates[action.requestKey].error = action.error
        // set didFetch to true on failure so the user can choose to force load the status
        storeDraft.requestStates[action.requestKey].initLoadComplete = true
      })
      break
    case "wsMessageReceived":
      nextStore = action.produceNextStore(store)
      break
  }

  return nextStore
}

/**
 * Hook that returns the store and the load actions that are passed down via the ApiProvider.
 */
function useApiActions(store: Store, dispatch: React.Dispatch<Action>) {
  const actions: Actions = {
    loadConfig: async (params: LoadActionParams = {}) => loadConfigHandler({ store, dispatch, ...params }),
    loadStatus: async (params: LoadActionParams = {}) => loadStatusHandler({ store, dispatch, ...params }),
    loadLogs: async (params: LoadLogsParams) => loadLogsHandler({ store, dispatch, ...params }),
    loadTaskResult: async (params: LoadTaskResultParams) => loadTaskResultHandler({ store, dispatch, ...params }),
    loadTestResult: async (params: LoadTestResultParams) => loadTestResultHandler({ store, dispatch, ...params }),
    loadGraph: async (params: LoadActionParams = {}) => loadGraphHandler({ store, dispatch, ...params }),
  }

  return actions
}

type Context = {
  store: Store;
  actions: Actions;
}

// Type cast the initial value to avoid having to check whether the context exists in every context consumer.
// Context is only undefined if the provider is missing which we assume is not the case.
const Context = React.createContext<Context>({} as Context)

/**
 * Returns the store and load actions via the Context
 */
export const useApi = () => useContext(Context)

/**
 * A Provider component that holds all data received from the garden-service API and websocket connections.
 * The store and actions are accessed from components via the `useApi` function.
 */
export const ApiProvider: React.FC = ({ children }) => {
  const [store, dispatch] = useReducer(reducer, initialState)
  const actions = useApiActions(store, dispatch)

  // Set up the ws connection
  // TODO: Add websocket state as dependency (second argument) so that the websocket is re-initialised
  // if the connection breaks.
  useEffect(() => {
    return initWebSocket(dispatch)
  }, [])

  return (
    <Context.Provider value={{ store, actions }}>
      {children}
    </Context.Provider>
  )
}
