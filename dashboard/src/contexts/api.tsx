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
import { GetTaskResultCommandResult } from "garden-service/build/src/commands/get/get-task-result"
import { GetTestResultCommandResult } from "garden-service/build/src/commands/get/get-test-result"
import { TestConfig } from "garden-service/build/src/config/test"
import { EventName } from "garden-service/build/src/events"
import { EnvironmentStatusMap } from "garden-service/build/src/types/plugin/provider/getEnvironmentStatus"
import { initWebSocket } from "../api/ws"

export type SupportedEventName = PickFromUnion<
  EventName,
  "taskPending" | "taskProcessing" | "taskComplete" | "taskGraphComplete" | "taskError" | "taskCancelled"
>

export const supportedEventNames: Set<SupportedEventName> = new Set([
  "taskPending",
  "taskProcessing",
  "taskComplete",
  "taskGraphComplete",
  "taskError",
  "taskCancelled",
])

export type TaskState = PickFromUnion<
  SupportedEventName,
  "taskComplete" | "taskError" | "taskPending" | "taskProcessing" | "taskCancelled"
>

export const taskStates = ["taskComplete", "taskError", "taskPending", "taskProcessing", "taskCancelled"]

export interface Test {
  config: TestConfig
  status: RunStatus
  result: GetTestResultCommandResult
  taskState: TaskState // State of the test task for the module
}

export interface Task {
  config: TaskConfig
  status: RunStatus
  result: GetTaskResultCommandResult
  taskState: TaskState // State of the task task for the module
}

export type Module = Pick<ModuleConfig, "name" | "type" | "path" | "repositoryUrl" | "description"> & {
  services: string[]
  tasks: string[]
  tests: string[]
  taskState: TaskState // State of the build task for the module
}

export interface Service {
  config: ServiceConfig
  status: ServiceStatus
  taskState: TaskState // State of the deploy task for the service
}

export interface RequestState {
  pending: boolean
  initLoadComplete: boolean
  error?: AxiosError
}

export interface Entities {
  project: {
    root: string
    taskGraphProcessing: boolean
  }
  modules: { [moduleName: string]: Module }
  services: { [serviceName: string]: Service }
  tasks: { [taskName: string]: Task }
  tests: { [testKey: string]: Test }
  logs: { [serviceName: string]: ServiceLogEntry[] }
  graph: GraphOutput
  providers: EnvironmentStatusMap
}

/**
 * The "global" data store
 */
export interface Store {
  entities: Entities
  requestStates: {
    config: RequestState
    status: RequestState
    graph: RequestState
    logs: RequestState
    testResult: RequestState
    taskResult: RequestState
  }
}

type RequestKey = keyof Store["requestStates"]
const requestKeys: RequestKey[] = ["config", "status", "logs", "testResult", "taskResult", "graph"]

type ProcessResults = (entities: Entities) => Entities

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
  processResults: ProcessResults
}

interface ActionError extends ActionBase {
  requestKey: RequestKey
  type: "fetchFailure"
  error: AxiosError
}

interface WsMessageReceived extends ActionBase {
  type: "wsMessageReceived"
  processResults: ProcessResults
}

export type Action = ActionStart | ActionError | ActionSuccess | WsMessageReceived

const initialRequestState = requestKeys.reduce(
  (acc, key) => {
    acc[key] = { pending: false, initLoadComplete: false }
    return acc
  },
  {} as { [K in RequestKey]: RequestState }
)

const initialState: Store = {
  entities: {
    project: {
      root: "",
      taskGraphProcessing: false,
    },
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
const reducer = (store: Store, action: Action) =>
  produce(store, (draft) => {
    switch (action.type) {
      case "fetchStart":
        draft.requestStates[action.requestKey].pending = true
        break
      case "fetchSuccess":
        // Produce the next store state from the fetch result and update the request state
        draft.entities = action.processResults(store.entities)
        draft.requestStates[action.requestKey].pending = false
        draft.requestStates[action.requestKey].initLoadComplete = true
        break
      case "fetchFailure":
        draft.requestStates[action.requestKey].pending = false
        draft.requestStates[action.requestKey].error = action.error
        draft.requestStates[action.requestKey].initLoadComplete = true
        break
      case "wsMessageReceived":
        draft.entities = action.processResults(store.entities)
        break
    }
  })

export type ApiDispatch = React.Dispatch<Action>

type Context = {
  store: Store
  dispatch: ApiDispatch
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

  // Set up the ws connection
  // TODO: Add websocket state as dependency (second argument) so that the websocket is re-initialised
  // if the connection breaks.
  useEffect(() => {
    return initWebSocket(dispatch)
  }, [])

  return <Context.Provider value={{ store, dispatch }}>{children}</Context.Provider>
}
