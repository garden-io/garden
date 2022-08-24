/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import produce from "immer"
import { groupBy, keyBy } from "lodash"

import type { ServiceLogEntry } from "@garden-io/core/build/src/types/service"
import type { StatusCommandResult } from "@garden-io/core/build/src/commands/get/get-status"
import type { GetRunResultCommandResult } from "@garden-io/core/build/src/commands/get/get-run-result"
import type { ConfigDump } from "@garden-io/core/build/src/garden"
import type { GetTestResultCommandResult } from "@garden-io/core/build/src/commands/get/get-test-result"
import type { GraphOutput } from "@garden-io/core/build/src/commands/get/get-graph"
import {
  ApiDispatch,
  defaultTaskState,
  Entities,
  ModuleEntity,
  DeployEntity,
  RunEntity,
  TestEntity,
  BuildEntity,
  defaultActionStatus,
} from "../contexts/api"
import {
  fetchConfig,
  fetchGraph,
  fetchLogs,
  fetchStatus,
  fetchTaskResult,
  FetchTaskResultParams,
  fetchTestResult,
  FetchTestResultParams,
} from "./api"
import { getAuthKey } from "../util/helpers"
import type { ProviderMap } from "@garden-io/core/build/src/config/provider"
import type { DashboardPage } from "@garden-io/core/build/src/plugin/handlers/provider/getDashboardPage"
import type { AxiosError } from "axios"

// This file contains the API action functions.
// The actions are responsible for dispatching the appropriate action types and normalising the
// API response.

// Section: Helpers

/**
 * Returns entity status if set, otherwise default status.
 */
function getEntityStatus(entity?: DeployEntity | BuildEntity | TestEntity | RunEntity) {
  return entity?.status || defaultActionStatus
}

/**
 * Returns task state if set, otherwise default task state.
 */
function getTaskState(entity?: DeployEntity | BuildEntity | TestEntity | RunEntity) {
  return entity?.taskState || defaultTaskState
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
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
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
        url: page.url || `/dashboardPages/${provider.name}/${page.name}?key=${getAuthKey()}`,
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

      for (const [kind, actions] of Object.entries(config.actionConfigs)) {
        for (const name of Object.keys(actions)) {
          const entity = entities[kind][name]
          draft.actions[kind][name] = {
            taskState: getTaskState(entity),
            status: getEntityStatus(entity),
          }
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
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
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
    for (const [kind, statuses] of Object.entries(status.actions)) {
      for (const s of Object.values(statuses)) {
        draft.actions[kind][s.name] = entities.actions[kind][s.name] || {}
        draft.actions[kind][s.name].status = s
      }
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
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
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

  let res: GetRunResultCommandResult
  try {
    res = await fetchTaskResult(fetchParams)
  } catch (error) {
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
    return
  }

  const processResults = (entities: Entities) => processRunResult(entities, fetchParams.name, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processRunResult(entities: Entities, name: string, result: GetRunResultCommandResult) {
  return produce(entities, (draft) => {
    if (result) {
      draft.actions.Run[name].result = result
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
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
    return
  }

  const processResults = (entities: Entities) => processTestResult(entities, fetchParams, res)

  dispatch({ type: "fetchSuccess", requestKey, processResults })
}

function processTestResult(entities: Entities, params: FetchTestResultParams, result: GetTestResultCommandResult) {
  return produce(entities, (draft) => {
    if (result) {
      draft.actions.Test[params.name].result = result
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
    dispatch({ requestKey, type: "fetchFailure", error: error as AxiosError })
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
