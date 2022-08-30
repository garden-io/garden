/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { useReducer } from "react"
import React from "react"
import produce from "immer"
import { AxiosError } from "axios"

import type { GraphOutput } from "@garden-io/core/build/src/commands/get/get-graph"
import type { ServiceLogEntry, ServiceStatus } from "@garden-io/core/build/src/types/service"
import type { ModuleConfig } from "@garden-io/core/build/src/config/module"
import type { PickFromUnion } from "@garden-io/core/build/src/util/util"
import type { GetTestResultCommandResult } from "@garden-io/core/build/src/commands/get/get-test-result"
import type { EventName } from "@garden-io/core/build/src/events"
import type { EnvironmentStatusMap } from "../../../core/build/src/plugin/handlers/provider/getEnvironmentStatus"
import { isSupportedEvent, processWebSocketMessage } from "../api/ws"
import type { ServerWebsocketMessage } from "@garden-io/core/build/src/server/server"
import { useWebsocket, useUiState } from "../hooks"
import type { ProviderMap } from "@garden-io/core/build/src/config/provider"
import { DashboardPage } from "../../../core/build/src/plugin/handlers/provider/getDashboardPage"
import type { BuildActionConfig } from "@garden-io/core/build/src/actions/build"
import type { BuildStatus } from "@garden-io/core/build/src/plugin/handlers/build/get-status"
import type { DeployActionConfig } from "@garden-io/core/build/src/actions/deploy"
import type { GetRunResultCommandResult } from "@garden-io/core/build/src/commands/get/get-run-result"
import type { TestActionConfig } from "@garden-io/core/build/src/actions/test"
import type { RunActionConfig } from "@garden-io/core/build/src/actions/run"
import type { GetTestResult } from "@garden-io/core/build/src/plugin/handlers/test/get-result"
import type { GetRunResult } from "@garden-io/core/build/src/plugin/handlers/run/get-result"
import type { ActionStatus } from "@garden-io/core/build/src/actions/types"

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
export const defaultTaskState: TaskState = "taskComplete"
export const defaultActionStatus: ActionStatus = {
  state: "unknown",
  detail: {},
  outputs: {},
}

interface BaseEntity {
  taskState: TaskState
}

export interface TestEntity extends BaseEntity {
  config: TestActionConfig
  status: GetTestResult
  result: GetTestResultCommandResult
}

export interface RunEntity extends BaseEntity {
  config: RunActionConfig
  status: GetRunResult
  result: GetRunResultCommandResult
  taskState: TaskState // State of the task task for the module
}

export type ModuleEntity = BaseEntity &
  Pick<ModuleConfig, "name" | "type" | "path" | "repositoryUrl" | "description" | "disabled"> & {
    services: string[]
    tasks: string[]
    tests: string[]
  }

export interface BuildEntity extends BaseEntity {
  config: BuildActionConfig<string, any>
  status: BuildStatus
}

export interface DeployEntity extends BaseEntity {
  config: DeployActionConfig
  status: ServiceStatus
}

export interface ProjectEntity {
  root: string
  taskGraphProcessing: boolean
}

export interface RequestState {
  pending: boolean
  initLoadComplete: boolean
  error?: AxiosError
}

export interface Page extends DashboardPage {
  path: string
}

export interface ProviderPage extends Page {
  providerName: string
}

/**
 * The modules, services, tasks, tests, and tests entities are loaded when the app
 * is initialised and guaranteed to exist when the consumers receive the store.
 *
 * Other store data is loaded opportunistically.
 */
export interface Entities {
  project: {
    root: string
    taskGraphProcessing: boolean
  }
  modules: { [moduleName: string]: ModuleEntity }
  actions: {
    Build: { [name: string]: BuildEntity }
    Deploy: { [name: string]: DeployEntity }
    Run: { [name: string]: RunEntity }
    Test: { [name: string]: TestEntity }
  }
  logs: { [serviceName: string]: ServiceLogEntry[] | undefined }
  graph: GraphOutput
  environmentStatuses: EnvironmentStatusMap
  providers: ProviderMap
  providerPages: ProviderPage[]
}

/**
 * The global API data store
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

export type RequestKey = keyof Store["requestStates"]
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

const initialRequestState = requestKeys.reduce((acc, key) => {
  acc[key] = { pending: false, initLoadComplete: false }
  return acc
}, {} as { [K in RequestKey]: RequestState })

const initialState: Store = {
  entities: {
    project: {
      root: "",
      taskGraphProcessing: false,
    },
    modules: {},
    actions: {
      Build: {},
      Deploy: {},
      Run: {},
      Test: {},
    },
    logs: {},
    graph: { nodes: [], relationships: [] },
    environmentStatuses: {},
    providers: {},
    providerPages: [],
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
export const ApiContext = React.createContext<Context>({} as Context)

/**
 * A Provider component that holds all data received from the core API and websocket connections.
 * The store and actions are accessed from components via the `useApi` function.
 */
export const ApiProvider: React.FC = ({ children }) => {
  const [store, dispatch] = useReducer(reducer, initialState)
  const { actions } = useUiState()

  const handleWsMsg = (wsMsg: MessageEvent) => {
    const parsedMsg = JSON.parse(wsMsg.data) as ServerWebsocketMessage

    if (parsedMsg.type === "error") {
      console.error(parsedMsg)
    }
    if (isSupportedEvent(parsedMsg)) {
      const processResults = (entities: Entities) => processWebSocketMessage(entities, parsedMsg)
      dispatch({ type: "wsMessageReceived", processResults })
    }
  }

  const handleWsClosed = () => {
    actions.showInfoBox("Lost connection to server. Attempting to reconnect...")
  }
  const handleWsOpened = () => {
    actions.hideInfoBox()
  }

  useWebsocket(handleWsMsg, handleWsOpened, handleWsClosed)

  return <ApiContext.Provider value={{ store, dispatch }}>{children}</ApiContext.Provider>
}
