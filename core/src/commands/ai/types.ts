/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Anthropic } from "@anthropic-ai/sdk"
import type { Log } from "../../logger/log-entry.js"
import type { Garden } from "../../garden.js"

export type MessageParam = Anthropic.Messages.MessageParam

export interface ProjectInfo {
  directories: FileSystemNode[]
  configFiles: ConfigFileInfo[]
  structure: ProjectStructure
}

export interface FileSystemNode {
  path: string
  type: "file" | "directory"
  name: string
  children?: FileSystemNode[]
}

export interface ConfigFileInfo {
  path: string
  type: ConfigFileType
  content?: string
}

export type ConfigFileType =
  | "kubernetes"
  | "dockerfile"
  | "garden"
  | "terraform"
  | "docker-compose"
  | "helm"
  | "unknown"

export interface ProjectStructure {
  hasKubernetes: boolean
  hasDocker: boolean
  hasGarden: boolean
  hasTerraform: boolean
  services: ServiceInfo[]
  builds: BuildInfo[]
  infrastructure: InfrastructureInfo[]
}

export interface ServiceInfo {
  name: string
  path: string
  type: string
}

export interface BuildInfo {
  name: string
  path: string
  type: string
}

export interface InfrastructureInfo {
  name: string
  path: string
  type: string
}

export interface AgentContext {
  anthropic: Anthropic
  projectRoot: string
  projectInfo: ProjectInfo
  log: Log
  garden: Garden
}

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentResponse {
  message: string
  actions?: AgentAction[]
  needsUserInput?: boolean
  userPrompt?: string
}

export interface AgentAction {
  type: "create_file" | "update_file" | "analyze_file" | "run_validation"
  data: Record<string, unknown>
}
