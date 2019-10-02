/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import axios from "axios"

import { GraphOutput } from "garden-service/build/src/commands/get/get-graph"
import { GetTaskResultCommandResult } from "garden-service/build/src/commands/get/get-task-result"
import { GetTestResultCommandResult } from "garden-service/build/src/commands/get/get-test-result"
import { ServiceLogEntry } from "garden-service/build/src/types/plugin/service/getServiceLogs"
import { CommandResult } from "garden-service/build/src/commands/base"
import { ConfigDump } from "garden-service/build/src/garden"
import { StatusCommandResult } from "garden-service/build/src/commands/get/get-status"

export interface ApiRequest {
  command: string
  parameters: {}
}

const MAX_LOG_LINES = 5000

export async function fetchConfig() {
  return apiPost<ConfigDump>("get.config")
}

export async function fetchGraph() {
  return apiPost<GraphOutput>("get.graph")
}

export async function fetchStatus() {
  return apiPost<StatusCommandResult>("get.status", { output: "json" })
}

export interface FetchLogsParams {
  serviceNames: string[]
}

export async function fetchLogs({ serviceNames }: FetchLogsParams) {
  const tail = Math.floor(MAX_LOG_LINES / serviceNames.length)
  return apiPost<ServiceLogEntry[]>("logs", { services: serviceNames, tail })
}

export interface FetchTaskResultParams {
  name: string
}

export async function fetchTaskResult(params: FetchTaskResultParams) {
  return apiPost<GetTaskResultCommandResult>("get.task-result", params)
}

export interface FetchTestResultParams {
  name: string
  moduleName: string
}

export async function fetchTestResult({ name, moduleName }: FetchTestResultParams) {
  return apiPost<GetTestResultCommandResult>("get.test-result", { name, module: moduleName })
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

  if (res.data.result === undefined) {
    throw new Error("Empty response from server")
  }

  return res.data.result
}
