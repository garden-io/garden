/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import axios from "axios"

// TODO: Figure out how to do proper type handling. The types here are mostly just copied from
// garden-service to facilitate rendering.

//===========================================================================
//region Types
//===========================================================================

export interface DashboardPage {
  title: string
  description: string
  url: string
  newWindow: boolean
  // TODO: allow nested sections
  // children: DashboardPage[]
}

interface Provider {
  name: string
  dashboardPages: DashboardPage[]
}

interface Service {
  config: any
  name: string
  spec: any
}

export interface Module {
  buildPath: string
  // version: ModuleVersion

  services: Service[]
  serviceNames: string[]
  serviceDependencyNames: string[]

  // tasks: Task<Module<M, S, T, W>>[]
  taskNames: string[]
  taskDependencyNames: string[]

  // _ConfigType: ModuleConfig<M, S, T, W>
}

export interface ServiceIngress {
  hostname: string
  path: string
  port: string
  protocol: string
}

export interface ServiceStatus {
  providerId?: string
  providerVersion?: string
  version?: string
  state?: string
  runningReplicas?: number
  ingresses?: ServiceIngress[],
  lastMessage?: string
  lastError?: string
  createdAt?: string
  updatedAt?: string
  detail?: any
}

export interface EnvironmentStatus {
  ready: boolean
  needUserInput?: boolean
  detail?: any
}

export interface FetchStatusResponse {
  providers: { [key: string]: EnvironmentStatus }
  services: { [name: string]: ServiceStatus }
}

export interface FetchConfigResponse {
  environmentName: string
  providers: Provider[]
  modules: Module[]
}

export interface ServiceLogEntry {
  serviceName: string
  timestamp: Date
  msg: string
}

export type FetchLogResponse = ServiceLogEntry[]

export interface ApiRequest {
  command: string
  parameters: {}
}

//===========================================================================
//region API functions
//===========================================================================

export async function fetchConfig(): Promise<FetchConfigResponse> {
  return apiPost<FetchConfigResponse>("get.config")
}

export async function fetchStatus(): Promise<FetchStatusResponse> {
  return apiPost<FetchStatusResponse>("get.status")
}

export async function fetchLogs(services?: string[]): Promise<FetchLogResponse> {
  const params = services ? { service: services } : {}
  return apiPost<FetchLogResponse>("logs", params)
}

async function apiPost<T>(command: string, parameters: {} = {}): Promise<T> {
  const url = "/api"
  const method = "POST"
  const headers = { "Content-Type": "application/json" }
  const data: ApiRequest = { command, parameters }

  const res = await axios({ url, method, headers, data })

  return res.data.result
}
