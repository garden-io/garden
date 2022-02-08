/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import produce from "immer"
import { groupBy, keyBy } from "lodash"

import { ServiceLogEntry } from "@garden-io/core/build/src/types/plugin/service/getServiceLogs"
import { StatusCommandResult } from "@garden-io/core/build/src/commands/get/get-status"
import { GetTaskResultCommandResult } from "@garden-io/core/build/src/commands/get/get-task-result"
import { ConfigDump } from "@garden-io/core/build/src/garden"
import { GetTestResultCommandResult } from "@garden-io/core/build/src/commands/get/get-test-result"
import { GraphOutput } from "@garden-io/core/build/src/commands/get/get-graph"
import {
  Entities,
  ModuleEntity,
  ServiceEntity,
  TaskEntity,
  TestEntity,
  ApiDispatch,
  defaultTaskState,
  defaultServiceStatus,
  defaultRunStatus,
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
import { getTestKey } from "../util/helpers"
import { ProviderMap } from "@garden-io/core/build/src/config/provider"
import { DashboardPage } from "@garden-io/core/build/src/types/plugin/provider/getDashboardPage"

// This file contains the API action functions.
// The actions are responsible for dispatching the appropriate action types and normalising the
// API response.

// Section: Helpers

/**
 * Returns service status if set, otherwise default service status.
 */
function getServiceStatus(service?: ServiceEntity) {
  return service ? service.status : defaultServiceStatus || defaultServiceStatus
}

/**
 * Returns task state if set, otherwise default task state.
 */
function getTaskState(entity?: ServiceEntity | ModuleEntity | TestEntity | TaskEntity) {
  return entity ? entity.taskState : defaultTaskState || defaultTaskState
}

/**
 * Returns run status if set, otherwise default run status.
 */
function getRunStatus(entity?: TaskEntity | TestEntity) {
  return entity ? entity.status : defaultRunStatus || defaultRunStatus
}

// Section: Init actions and process handlers

/**
 * Fetch the init data for the API store.
 *
 * This action is called first and hydrates the initial app state.
 */
export async function initApiStore(dispatch: ApiDispatch) {
  await Promise.all([loadConfig(dispatch), loadStatus(dispatch)])
}

async function loadConfig(dispatch: ApiDispatch) {
  const requestKey = "config"

  dispatch({ requestKey, type: "fetchStart" })
  let res: ConfigDump

  try {
    res = await fetchConfig()
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processConfigInitResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

/**
 * Invariant: The fetchConfig and fetchStatus calls fire concurrently on app initialisation
 * so that we get a faster initial render. Therefore the process functions need to account for
 * the store not having been initialised.
 *
 * Other process handlers can assume that the store has been initialised.
 */
function processConfigInitResult(entities: Entities, config: ConfigDump) {
  return produce(entities, (draft) => {
    draft.providers = keyBy(config.providers, "name") as ProviderMap
    draft.providerPages = config.providers.flatMap((provider) => {
      return (provider.dashboardPages || []).map((page: DashboardPage) => ({
        ...page,
        providerName: provider.name,
        path: `/provider/${provider.name}/${page.name}`,
        description: page.description + ` (from provider ${provider.name})`,
        // Use static URL if provided, otherwise we'll request a redirect from this API endpoint
        url: page.url || `/dashboardPages/${provider.name}/${page.name}`,
      }))
    })

    for (const cfg of config.moduleConfigs) {
      const module: ModuleEntity = {
        name: cfg.name,
        type: cfg.type,
        path: cfg.path,
        disabled: cfg.disabled,
        repositoryUrl: cfg.repositoryUrl,
        description: cfg.description,
        services: cfg.serviceConfigs.map((service) => service.name),
        tests: cfg.testConfigs.map((test) => `${cfg.name}.${test.name}`),
        tasks: cfg.taskConfigs.map((task) => task.name),
        taskState: "taskComplete",
      }
      draft.modules[cfg.name] = module

      const moduleDisabled = module.disabled
      for (const serviceConfig of cfg.serviceConfigs) {
        const service = entities.services[serviceConfig.name]
        draft.services[serviceConfig.name] = {
          taskState: getTaskState(service),
          status: getServiceStatus(service),
          config: {
            ...serviceConfig,
            moduleDisabled,
          },
        }
      }
      for (const testConfig of cfg.testConfigs) {
        const testKey = getTestKey({ testName: testConfig.name, moduleName: cfg.name })
        const test = entities.tests[testKey]
        draft.tests[testKey] = {
          taskState: getTaskState(test),
          status: getRunStatus(test),
          result: null,
          config: {
            ...testConfig,
            moduleDisabled,
          },
        }
      }
      for (const taskConfig of cfg.taskConfigs) {
        const task = entities.tasks[taskConfig.name]
        draft.tasks[taskConfig.name] = {
          taskState: getTaskState(task),
          status: getRunStatus(task),
          result: null,
          config: {
            ...taskConfig,
            moduleDisabled,
          },
        }
      }
    }
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

  const processResults = (entities: Entities) => processStatusInitResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

/**
 * Invariant: The fetchConfig and fetchStatus calls fire concurrently on app initialisation
 * so that we get a faster initial render. Therefore the process functions need to account for
 * the store not having been initialised.
 *
 * Other process handlers can assume that the store has been initialised.
 */
function processStatusInitResult(entities: Entities, status: StatusCommandResult) {
  return produce(entities, (draft) => {
    for (const serviceName of Object.keys(status.services)) {
      draft.services[serviceName] = entities.services[serviceName] || {}
      draft.services[serviceName].status = status.services[serviceName]
    }
    for (const [taskName, taskStatus] of Object.entries(status.tasks || {})) {
      draft.tasks[taskName] = entities.tasks[taskName] || {}
      draft.tasks[taskName].status = taskStatus
    }
    for (const [testName, testStatus] of Object.entries(status.tests || {})) {
      draft.tests[testName] = entities.tests[testName] || {}
      draft.tests[testName].status = testStatus
    }
    draft.environmentStatuses = status.providers
  })
}

// Section: Actions and process handlers

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
  return produce(entities, (draft) => {
    draft.logs = groupBy(logs, "serviceName")
  })
}

interface LoadTaskResultParams extends FetchTaskResultParams {
  dispatch: ApiDispatch
}

export async function loadTaskResult({ dispatch, ...fetchParams }: LoadTaskResultParams) {
  const requestKey = "taskResult"

  dispatch({ requestKey, type: "fetchStart" })

  let res: GetTaskResultCommandResult
  try {
    res = await fetchTaskResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processTaskResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processTaskResult(entities: Entities, result: GetTaskResultCommandResult) {
  return produce(entities, (draft) => {
    if (result) {
      draft.tasks[result.taskName].result = result
    }
  })
}

interface LoadTestResultParams extends FetchTestResultParams {
  dispatch: ApiDispatch
}

export async function loadTestResult({ dispatch, ...fetchParams }: LoadTestResultParams) {
  const requestKey = "testResult"

  dispatch({ requestKey, type: "fetchStart" })

  let res: GetTestResultCommandResult
  try {
    res = await fetchTestResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error })
    return
  }

  const processResults = (entities: Entities) => processTestResult(entities, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processTestResult(entities: Entities, result: GetTestResultCommandResult) {
  return produce(entities, (draft) => {
    if (result) {
      // Test names are not unique so we store the data under a unique test key
      const testKey = getTestKey({ testName: result.testName, moduleName: result.moduleName })
      draft.tests[testKey].result = result
    }
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
  return produce(entities, (draft) => {
    draft.graph = graph
  })
}
