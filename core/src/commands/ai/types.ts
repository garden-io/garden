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
import type { Interface as ReadLineInterface } from "node:readline/promises"

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
  projectInfo?: ProjectInfo
  log: Log
  garden: Garden
  yolo: boolean
  rl?: ReadLineInterface
  /**
   * Tracks files newly created by the AI assistant in the current run. Used to
   * allow subsequent overwrites without prompting the user again (idempotent
   * writes).
   */
  newFiles?: Set<string>
}

// Define node names as const to get literal types
export const NODE_NAMES = {
  HUMAN_LOOP: "user_input",
  MAIN_AGENT: "main_agent",
  PROJECT_EXPLORER: "project_explorer",
  KUBERNETES_AGENT: "kubernetes",
  DOCKER_AGENT: "docker",
  GARDEN_AGENT: "garden",
  TERRAFORM_AGENT: "terraform",
  TASK_ROUTER: "task_router",
  // RESPONSE_SYNTHESIZER: "response_synthesizer",
} as const
// Extract the node names type

export type NodeName = (typeof NODE_NAMES)[keyof typeof NODE_NAMES]
