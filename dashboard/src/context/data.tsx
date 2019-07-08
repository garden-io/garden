/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { useReducer, useEffect } from "react"
import React from "react"
import { groupBy } from "lodash"
import produce from "immer"
import { merge } from "lodash"

import {
  fetchConfig,
  FetchLogsParam,
  FetchTaskResultParam,
  FetchTestResultParam,
  fetchLogs,
  fetchStatus,
  fetchTaskResult,
  fetchTestResult,
  fetchGraph,
} from "../api/api"
import { ServiceLogEntry } from "garden-cli/src/types/plugin/service/getServiceLogs"
import { GraphOutput } from "garden-cli/src/commands/get/get-graph"
import { AxiosError } from "axios"
import { SupportedEventName } from "./events"
import { ServiceStatus } from "garden-cli/src/types/service"
import { ModuleConfig } from "garden-cli/src/config/module"
import { Omit, PickFromUnion } from "garden-cli/src/util/util"
import { ServiceConfig } from "garden-cli/src/config/service"
import { RunStatus, StatusCommandResult } from "garden-cli/src/commands/get/get-status"
import { ConfigDump } from "garden-cli/src/garden"
import { TaskConfig } from "garden-cli/src/config/task"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"
import { TestConfig } from "garden-cli/src/config/test"
import getApiUrl from "../api/get-api-url"
import { ServerWebsocketMessage } from "garden-cli/src/server/server"
import { EventName, Events } from "garden-cli/src/events"
import { EnvironmentStatusMap } from "garden-cli/src/types/plugin/provider/getEnvironmentStatus"

export type TaskState = PickFromUnion<
  SupportedEventName, "taskComplete" | "taskError" | "taskPending" | "taskProcessing"
>

export interface TestEntity {
  config: TestConfig,
  status: RunStatus,
  result: TestResultOutput,
  taskState: TaskState, // Test Running State (in progress/ failed/ succeeded/ pending)
}

export interface TaskEntity {
  config: TaskConfig,
  status: RunStatus,
  result: TaskResultOutput,
  taskState: TaskState, // Task Running state (in progress/ failed/ succeeded/ pending)
}

export type ModuleEntity = Omit<Partial<ModuleConfig>, "serviceConfigs" | "testConfigs" | "taskConfigs"> & {
  services: string[],
  tasks: string[],
  tests: string[],
  taskState: TaskState, // Module Building state (in progress/ failed/ succeeded/ pending)
}

export interface ServiceEntity {
  config: ServiceConfig,
  status: ServiceStatus,
  taskState: TaskState, //  Service Deploying state (in progress/ failed/ succeeded/ pending)
}

interface RequestState {
  loading: boolean,
  alreadyFetched: boolean
  error?: AxiosError,
}

interface Store {
  projectRoot?: string,
  entities: {
    modules: { [moduleName: string]: ModuleEntity }
    services: { [serviceName: string]: ServiceEntity }
    tasks: { [taskId: string]: TaskEntity }
    tests: { [testKey: string]: TestEntity }
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

type Context = {
  store: Store;
  actions: Actions;
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
  store: Store
}

interface ActionError extends ActionBase {
  requestKey: RequestKey
  type: "fetchFailure"
  error: AxiosError
}

interface WsMessageReceived extends ActionBase {
  type: "wsMessageReceived"
  store: Store
}

type Action = ActionStart | ActionError | ActionSuccess | WsMessageReceived

export type LoadLogs = (param: FetchLogsParam, force?: boolean) => void
export type LoadTaskResult = (param: FetchTaskResultParam, force?: boolean) => void
export type LoadTestResult = (param: FetchTestResultParam, force?: boolean) => void
type Loader = (force?: boolean) => void

// FIXME: We shouldn't repeat the keys for both the type and the set below
export type SupportedEventName = PickFromUnion<
  EventName, "taskPending" | "taskProcessing" | "taskComplete" | "taskGraphComplete" | "taskError"
>
export const supportedEventNames: Set<SupportedEventName> = new Set(
  ["taskPending", "taskProcessing", "taskComplete", "taskGraphComplete", "taskError"],
)
export type WsEventMessage = ServerWebsocketMessage & {
  type: "event",
  name: SupportedEventName,
  payload: Events[SupportedEventName],
}

/**
 * Type guard to check whether websocket message is a type supported by the Dashboard
 */
function isSupportedEvent(data: ServerWebsocketMessage): data is WsEventMessage {
  return data.type === "event" && supportedEventNames.has((data as WsEventMessage).name)
}

interface Actions {
  loadLogs: LoadLogs
  loadTaskResult: LoadTaskResult
  loadTestResult: LoadTestResult
  loadConfig: Loader
  loadStatus: Loader
  loadGraph: Loader
}

const initialRequestState = requestKeys.reduce((acc, key) => {
  acc[key] = { loading: false, alreadyFetched: false }
  return acc
}, {} as { [K in RequestKey]: RequestState })

const initialState: Store = {
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
 * The reducer for the useApi hook. Sets the state for a given slice of the store on fetch events.
 */
function reducer(store: Store, action: Action): Store {
  let updatedStore: Store = store

  switch (action.type) {
    case "fetchStart":
      updatedStore = produce(store, storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = true
      })
      break
    case "fetchSuccess":
      updatedStore = produce(merge(store, action.store), storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = false
        storeDraft.requestStates[action.requestKey].alreadyFetched = true
      })
      break
    case "fetchFailure":
      updatedStore = produce(store, storeDraft => {
        storeDraft.requestStates[action.requestKey].loading = false
        storeDraft.requestStates[action.requestKey].error = action.error
        storeDraft.requestStates[action.requestKey].alreadyFetched = true
        // in case of failure we set alreadyFetched to true so if there was an error
        // the user can choose to force load the status
      })
      break
    case "wsMessageReceived":
      updatedStore = { ...merge(store, action.store) }
      break
  }

  return updatedStore
}

// Process the get-config response and return a normalized store
function processConfig(store: Store, config: ConfigDump) {
  let modules: { [moduleName: string]: ModuleEntity } = {}
  let services: { [serviceName: string]: ServiceEntity } = {}
  let tasks: { [taskId: string]: TaskEntity } = {}
  let tests: { [testKey: string]: TestEntity } = {}

  for (const cfg of config.moduleConfigs) {

    const module: ModuleEntity = {
      name: cfg.name,
      type: cfg.type,
      path: cfg.path,
      repositoryUrl: cfg.repositoryUrl,
      description: cfg.description,
      services: cfg.serviceConfigs.map(service => service.name),
      tests: cfg.testConfigs.map(test => `${cfg.name}.${test.name}`),
      tasks: cfg.taskConfigs.map(task => task.name),
      taskState: "taskComplete",
    }
    modules[cfg.name] = module
    for (const serviceConfig of cfg.serviceConfigs) {
      services[serviceConfig.name] = {
        ...services[serviceConfig.name],
        config: serviceConfig,
      }
    }
    for (const testConfig of cfg.testConfigs) {
      const testKey = `${cfg.name}.${testConfig.name}`
      tests[testKey] = {
        ...tests[testKey],
        config: testConfig,
      }
    }
    for (const taskConfig of cfg.taskConfigs) {
      tasks[taskConfig.name] = {
        ...tasks[taskConfig.name],
        config: taskConfig,
      }
    }
  }

  const processedStore = produce(store, storeDraft => {
    storeDraft.entities.modules = modules
    storeDraft.entities.services = services
    storeDraft.entities.tests = tests
    storeDraft.entities.tasks = tasks
    storeDraft.projectRoot = config.projectRoot
  })

  return processedStore
}

// Process the logs response and return a normalized store
function processLogs(store: Store, logs: ServiceLogEntry[]) {
  return produce(store, storeDraft => {
    storeDraft.entities.logs = groupBy(logs, "serviceName")
  })
}

// Process the status response and return a normalized store
function processStatus(store: Store, status: StatusCommandResult) {

  const processedStore = produce(store, storeDraft => {
    for (const serviceName of Object.keys(status.services)) {
      storeDraft.entities.services[serviceName] = {
        ...storeDraft.entities.services[serviceName],
        status: status.services[serviceName],
      }
    }
    for (const testName of Object.keys(status.tests)) {
      storeDraft.entities.tests[testName] = {
        ...storeDraft.entities.tests[testName],
        status: status.tests[testName],
      }
    }
    for (const taskName of Object.keys(status.tasks)) {
      storeDraft.entities.tasks[taskName] = {
        ...storeDraft.entities.tasks[taskName],
        status: status.tasks[taskName],
      }
    }
    storeDraft.entities.providers = status.providers
  })

  return processedStore
}

// Process the task result response and return a normalized store
function processTaskResult(store: Store, result: TaskResultOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.tasks = storeDraft.entities.tasks || {}
    storeDraft.entities.tasks[result.name] = storeDraft.entities.tasks[result.name] || {}
    storeDraft.entities.tasks[result.name].result = result
  })
}

// Process the task result response and return a normalized store
function processTestResult(store: Store, result: TestResultOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.tests = storeDraft.entities.tests || {}
    storeDraft.entities.tests[result.name] = storeDraft.entities.tests[result.name] || {}
    storeDraft.entities.tests[result.name].result = result
  })
}

// Process the graph response and return a normalized store
function processGraph(store: Store, graph: GraphOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.graph = graph
  })
}

// Process the graph response and return a normalized store
function processWebSocketMessage(store: Store, message: WsEventMessage) {
  const storeDraft = { ...store }
  const taskType = message.payload["type"] === "task" ? "run" : message.payload["type"] // convert "task" to "run"
  const taskState = message.name
  const entityName = message.payload["name"]
  if (taskType && taskState !== "taskGraphComplete") { // not available for taskGraphComplete
    storeDraft.requestStates.fetchTaskStates.loading = true
    switch (taskType) {
      case "publish":
        break
      case "deploy":
        storeDraft.entities.services[entityName] = {
          ...storeDraft.entities.services[entityName],
          taskState,
        }
        break
      case "build":
        storeDraft.entities.modules[entityName] = {
          ...store.entities.modules[entityName],
          taskState,
        }
        break
      case "run":
        storeDraft.entities.tasks[entityName] = {
          ...store.entities.tasks[entityName],
          taskState,
        }
        break
      case "test":
        storeDraft.entities.tests[entityName] = {
          ...store.entities.tests[entityName], taskState,
        }
        break
    }
  }

  if (taskState === "taskGraphComplete") { // add to requestState graph whenever its taskGraphComplete
    storeDraft.requestStates.fetchTaskStates.loading = false
  }

  return storeDraft
}

/**
 * This is an example of what the useApi hook could look like. It contains all the loader
 * functions as before and the ws connection. We could perhaps refactor this so that the functions bodies
 * are not inside the hook. In that case we'd need to pass the store and dispatch to the outer function.
 *
 * We could also consider having the ws logic in another hook. We'd also need to pass the store and
 * dispatch to that hook.
 */
function useApi(store: Store, dispatch: React.Dispatch<Action>) {

  const loadConfig: Loader = async (force: boolean = false) => {
    const requestKey = "fetchConfig"

    if (!force && store.requestStates[requestKey].alreadyFetched) {
      return
    }

    dispatch({ requestKey, type: "fetchStart" })
    let res: ConfigDump
    try {
      res = await fetchConfig()
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    const processedStore = processConfig(store, res)
    dispatch({ store: processedStore, type: "fetchSuccess", requestKey })
  }

  const loadLogs = async (serviceNames: string[], force: boolean = false) => {
    const requestKey = "fetchLogs"

    if ((!force && store.requestStates[requestKey].alreadyFetched) || !serviceNames.length) {
      return
    }
    dispatch({ requestKey, type: "fetchStart" })

    let res: ServiceLogEntry[]
    try {
      res = await fetchLogs(serviceNames)
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    dispatch({ store: processLogs(store, res), type: "fetchSuccess", requestKey })
  }

  const loadStatus: Loader = async (force: boolean = false) => {
    const requestKey = "fetchStatus"

    if (!force && store.requestStates[requestKey].alreadyFetched) {
      return
    }

    dispatch({ requestKey, type: "fetchStart" })

    let res: StatusCommandResult
    try {
      res = await fetchStatus()
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    dispatch({ store: processStatus(store, res), type: "fetchSuccess", requestKey })
  }

  const loadTaskResult: LoadTaskResult = async (param: FetchTaskResultParam, force?: boolean) => {
    const requestKey = "fetchTaskResult"

    if (!force && store.requestStates[requestKey].alreadyFetched) {
      return
    }

    dispatch({ requestKey, type: "fetchStart" })

    let res: TaskResultOutput
    try {
      res = await fetchTaskResult(param)
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    dispatch({ store: processTaskResult(store, res), type: "fetchSuccess", requestKey })
  }

  const loadTestResult: LoadTestResult = async (param: FetchTestResultParam, force?: boolean) => {
    const requestKey = "fetchTestResult"

    if (!force && store.requestStates[requestKey].alreadyFetched) {
      return
    }

    dispatch({ requestKey, type: "fetchStart" })

    let res: TestResultOutput
    try {
      res = await fetchTestResult(param)
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    dispatch({ store: processTestResult(store, res), type: "fetchSuccess", requestKey })
  }

  const loadGraph: Loader = async (force: boolean = false) => {
    const requestKey = "fetchGraph"

    if (!force && store.requestStates[requestKey].alreadyFetched) {
      return
    }

    dispatch({ requestKey, type: "fetchStart" })

    let res: GraphOutput
    try {
      res = await fetchGraph()
    } catch (error) {
      dispatch({ requestKey, type: "fetchFailure", error })
      return
    }

    dispatch({ store: processGraph(store, res), type: "fetchSuccess", requestKey })
  }
  // For setting up the ws connection
  useEffect(() => {
    // TODO: Ben check why rendered twice
    const url = getApiUrl()
    const ws = new WebSocket(`ws://${url}/ws`)
    ws.onopen = event => {
      console.log("ws open", event)
    }
    ws.onclose = event => {
      console.log("ws close", event)
    }
    ws.onmessage = msg => {
      const parsedMsg = JSON.parse(msg.data) as ServerWebsocketMessage

      if (parsedMsg.type === "error") {
        console.error(parsedMsg)
      }
      if (isSupportedEvent(parsedMsg)) {
        dispatch({ store: processWebSocketMessage(store, parsedMsg), type: "wsMessageReceived" })
      }
    }
    return function cleanUp() {
      console.log("ws cleanup")
      ws.close()
    }
  }, [])

  return {
    store,
    actions: {
      loadConfig,
      loadStatus,
      loadLogs,
      loadTaskResult,
      loadTestResult,
      loadGraph,
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
  const [store, dispatch] = useReducer(reducer, initialState)
  const storeAndActions = useApi(store, dispatch)
  return (
    <DataContext.Provider value={storeAndActions}>
      {children}
    </DataContext.Provider>
  )
}
