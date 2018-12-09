/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// TODO: Figure out how to do proper type handling. The types here are mostly just copied from
// garden-service to facilitate rendering.

export interface DashboardPage {
  title: string
  description: string
  url: string
  newWindow: boolean
  // TODO: allow nested sections
  // children: DashboardPage[]
}

export interface Provider {
  name: string
  dashboardPages: DashboardPage[]
}

export interface Service {
  config: any
  name: string
  spec: any
}

export interface Module {
  name: string
  buildPath: string
  type: string
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

export type RenderedNode = { type: RenderedNodeType, name: string }

export type RenderedNodeType = "build" | "deploy" | "runTask" | "test" | "push" | "publish"

export type RenderedEdge = { dependant: RenderedNode, dependency: RenderedNode }

export interface FetchGraphResponse {
  nodes: RenderedNode[],
  relationships: RenderedEdge[],
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

export interface WsPayload {
  addedAt: string
  key: string
  version: any
}

export type NodeTask = "taskPending" | "taskComplete" | "taskError"

export interface WsMessage {
  type: "event" | "error" | "commandResult"
  name: NodeTask | "taskGraphProcessing" | "taskGraphComplete"
  payload: WsPayload
}
