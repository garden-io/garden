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
  Entities,
  Module,
  Service,
  Task,
  Test,
  ApiDispatch,
} from "../contexts/api"
import {
  fetchLogs,
  fetchStatus,
  fetchTaskResult,
  fetchConfig,
  fetchTestResult,
  fetchGraph,
  FetchTaskResultParams,
  FetchTestResultParams,
} from "./api"

/**
 * This file contains the API action functions.
 *
 * The actions are responsible for dispatching the appropriate action types and normalising the
 * API response.
 */

export async function loadConfig(dispatch: ApiDispatch) {
  const requestKey = "config"

  dispatch({ requestKey, type: "fetchStart" })
  let res: ConfigDump

  try {
    res = await fetchConfig()
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processConfig(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processConfig(entities: Entities, config: ConfigDump) {
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

  return produce(entities, draft => {
    draft.modules = modules
    draft.services = services
    draft.tests = tests
    draft.tasks = tasks
    draft.project.root = config.projectRoot
  })
}

export async function loadLogs(dispatch: ApiDispatch, serviceNames: string[]) {
  const requestKey = "logs"

  dispatch({ requestKey, type: "fetchStart" })

  let res: ServiceLogEntry[]
  try {
    res = await fetchLogs({ serviceNames })
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processLogs(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processLogs(entities: Entities, logs: ServiceLogEntry[]) {
  return produce(entities, draft => {
    draft.logs = groupBy(logs, "serviceName")
  })
}

export async function loadStatus(dispatch: ApiDispatch) {
  const requestKey = "status"

  dispatch({ requestKey, type: "fetchStart" })

  let res: StatusCommandResult
  try {
    res = await fetchStatus()
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processStatus(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processStatus(entities: Entities, status: StatusCommandResult) {
  return produce(entities, draft => {
    for (const serviceName of Object.keys(status.services)) {
      draft.services[serviceName] = {
        ...draft.services[serviceName],
        status: status.services[serviceName],
      }
    }
    for (const testName of Object.keys(status.tests)) {
      draft.tests[testName] = {
        ...draft.tests[testName],
        status: status.tests[testName],
      }
    }
    for (const taskName of Object.keys(status.tasks)) {
      draft.tasks[taskName] = {
        ...draft.tasks[taskName],
        status: status.tasks[taskName],
      }
    }
    draft.providers = status.providers
  })
}

interface LoadTaskResultParams extends FetchTaskResultParams {
  dispatch: ApiDispatch
}

export async function loadTaskResult({ dispatch, ...fetchParams }: LoadTaskResultParams) {
  const requestKey = "taskResult"

  dispatch({ requestKey, type: "fetchStart" })

  let res: TaskResultOutput
  try {
    res = await fetchTaskResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processTaskResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processTaskResult(entities: Entities, result: TaskResultOutput) {
  return produce(entities, draft => {
    draft.tasks = draft.tasks || {}
    draft.tasks[result.name] = draft.tasks[result.name] || {}
    draft.tasks[result.name].result = result
  })
}

interface LoadTestResultParams extends FetchTestResultParams {
  dispatch: ApiDispatch
}

export async function loadTestResult({ dispatch, ...fetchParams }: LoadTestResultParams) {
  const requestKey = "testResult"

  dispatch({ requestKey, type: "fetchStart" })

  let res: TestResultOutput
  try {
    res = await fetchTestResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processTestResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processTestResult(entities: Entities, result: TestResultOutput) {
  return produce(entities, draft => {
    draft.tests = draft.tests || {}
    draft.tests[result.name] = draft.tests[result.name] || {}
    draft.tests[result.name].result = result
  })
}

export async function loadGraph(dispatch: ApiDispatch) {
  const requestKey = "graph"

  dispatch({ requestKey, type: "fetchStart" })

  let res: GraphOutput
  try {
    res = await fetchGraph()
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processGraph(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processGraph(entities: Entities, graph: GraphOutput) {
  return produce(entities, draft => {
    draft.graph = graph
  })
}
