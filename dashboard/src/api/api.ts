/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import axios from "axios"

import { GraphOutput } from "garden-cli/src/commands/get/get-graph"
import { TaskResultOutput } from "garden-cli/src/commands/get/get-task-result"
import { TestResultOutput } from "garden-cli/src/commands/get/get-test-result"
import { ServiceLogEntry } from "garden-cli/src/types/plugin/outputs"
import { CommandResult } from "garden-cli/src/commands/base"
import { ConfigDump } from "garden-cli/src/garden"
import { EnvironmentStatus } from "garden-cli/src/actions"

export interface ApiRequest {
  command: string
  parameters: {}
}
export type FetchLogsParam = string[]
export type FetchTaskResultParam = { name: string }
export type FetchTestResultParam = { name: string, module: string }

const MAX_LOG_LINES = 5000

export async function fetchConfig() {
  return apiPost<ConfigDump>("get.config")
}

export async function fetchGraph() {
  return apiPost<GraphOutput>("get.graph")
}

export async function fetchStatus() {
  return apiPost<EnvironmentStatus>("get.status")
}

export async function fetchLogs(services: FetchLogsParam) {
  const tail = Math.floor(MAX_LOG_LINES / services.length)
  return apiPost<ServiceLogEntry[]>("logs", { services, tail })
}

export async function fetchTaskResult(params: FetchTaskResultParam) {
  return apiPost<TaskResultOutput>("get.task-result", params)
}

export async function fetchTestResult(params: FetchTestResultParam) {
  return apiPost<TestResultOutput>("get.test-result", params)
}

async function apiPost<T>(command: string, parameters: {} = {}): Promise<T> {
  const url = "/api"
  const method = "POST"
  const headers = { "Content-Type": "application/json" }
  const data: ApiRequest = { command, parameters }

  const res = await axios.request<CommandResult<T>>({ url, method, headers, data })

  if (res.data.errors) {
    throw res.data.errors
  }

  if (!res.data.result) {
    throw new Error("result is empty")
  }

  return res.data.result
}
