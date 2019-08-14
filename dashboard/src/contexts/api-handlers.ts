/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import produce from "immer"
import { groupBy } from "lodash"

import { ServiceLogEntry } from "garden-service/build/src/types/plugin/service/getServiceLogs"
import { StatusCommandResult } from "garden-service/build/src/commands/get/get-status"
import { TaskResultOutput } from "garden-service/build/src/commands/get/get-task-result"
import { ConfigDump } from "garden-service/build/src/garden"
import { TestResultOutput } from "garden-service/build/src/commands/get/get-test-result"
import { GraphOutput } from "garden-service/build/src/commands/get/get-graph"
import {
  Store,
  Action,
  Module,
  Service,
  Task,
  Test,
} from "./api"
import {
  fetchLogs,
  fetchStatus,
  fetchTaskResult,
  fetchConfig,
  fetchTestResult,
  fetchGraph,
  FetchLogsParams,
  FetchTaskResultParams,
  FetchTestResultParams,
} from "../api/api"

/**
 * This file contains handler functions that the API hook calls to load data.
 *
 * The handlers are responsible for dispatching the appropriate actions and normalising the
 * API response.
 *
 * The handlers return without fetching if the data already exists in the store (and force is set to false)
 */

interface LoadHandlerParams {
  store: Store,
  dispatch: React.Dispatch<Action>,
  force?: boolean,
}

export async function loadConfigHandler({ store, dispatch, force = false }: LoadHandlerParams) {
  const requestKey = "fetchConfig"

  if (!force && store.requestStates[requestKey].didFetch) {
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

function processConfig(store: Store, config: ConfigDump) {
  let modules: { [moduleName: string]: Module } = {}
  let services: { [serviceName: string]: Service } = {}
  let tasks: { [taskName: string]: Task } = {}
  let tests: { [testKey: string]: Test } = {}

  for (const cfg of config.moduleConfigs) {

    const module: Module = {
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

interface LoadLogsHandlerParams extends LoadHandlerParams, FetchLogsParams { }

export async function loadLogsHandler({ serviceNames, store, dispatch, force = false }: LoadLogsHandlerParams) {
  const requestKey = "fetchLogs"

  if ((!force && store.requestStates[requestKey].didFetch) || !serviceNames.length) {
    return
  }
  dispatch({ requestKey, type: "fetchStart" })

  let res: ServiceLogEntry[]
  try {
    res = await fetchLogs({ serviceNames })
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  dispatch({ store: processLogs(store, res), type: "fetchSuccess", requestKey })
}

function processLogs(store: Store, logs: ServiceLogEntry[]) {
  return produce(store, storeDraft => {
    storeDraft.entities.logs = groupBy(logs, "serviceName")
  })
}

export async function loadStatusHandler({ store, dispatch, force = false }: LoadHandlerParams) {
  const requestKey = "fetchStatus"

  if (!force && store.requestStates[requestKey].didFetch) {
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

interface LoadTaskResultHandlerParams extends LoadHandlerParams, FetchTaskResultParams { }

export async function loadTaskResultHandler(
  { store, dispatch, force = false, ...fetchParams }: LoadTaskResultHandlerParams,
) {
  const requestKey = "fetchTaskResult"

  if (!force && store.requestStates[requestKey].didFetch) {
    return
  }

  dispatch({ requestKey, type: "fetchStart" })

  let res: TaskResultOutput
  try {
    res = await fetchTaskResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  dispatch({ store: processTaskResult(store, res), type: "fetchSuccess", requestKey })
}

function processTaskResult(store: Store, result: TaskResultOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.tasks = storeDraft.entities.tasks || {}
    storeDraft.entities.tasks[result.name] = storeDraft.entities.tasks[result.name] || {}
    storeDraft.entities.tasks[result.name].result = result
  })
}

interface LoadTestResultParams extends LoadHandlerParams, FetchTestResultParams { }

export async function loadTestResultHandler({ store, dispatch, force = false, ...fetchParams }: LoadTestResultParams) {
  const requestKey = "fetchTestResult"

  if (!force && store.requestStates[requestKey].didFetch) {
    return
  }

  dispatch({ requestKey, type: "fetchStart" })

  let res: TestResultOutput
  try {
    res = await fetchTestResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  dispatch({ store: processTestResult(store, res), type: "fetchSuccess", requestKey })
}

function processTestResult(store: Store, result: TestResultOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.tests = storeDraft.entities.tests || {}
    storeDraft.entities.tests[result.name] = storeDraft.entities.tests[result.name] || {}
    storeDraft.entities.tests[result.name].result = result
  })
}

export async function loadGraphHandler({ store, dispatch, force = false }: LoadHandlerParams) {
  const requestKey = "fetchGraph"

  if (!force && store.requestStates[requestKey].didFetch) {
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

function processGraph(store: Store, graph: GraphOutput) {
  return produce(store, storeDraft => {
    storeDraft.entities.graph = graph
  })
}
