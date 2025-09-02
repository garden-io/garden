/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseMessage } from "@langchain/core/messages"
import type { AgentContext } from "../../types.js"
import { Annotation, messagesStateReducer } from "@langchain/langgraph"

// TODO: merge with ../types.ts

const uniqueReducer = (left: string[], right: string[]) => [...new Set([...left, ...right])]
const overwriteReducer = <T>(_left: T, right: T) => right

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  initialUserQuery: Annotation<string>({
    reducer: overwriteReducer,
  }),
  expertsConsulted: Annotation<string[]>({
    reducer: uniqueReducer,
    default: () => [],
  }),
  finalResponse: Annotation<string>({
    reducer: overwriteReducer,
  }),
  context: Annotation<AgentContext>({
    reducer: overwriteReducer,
  }),
  step: Annotation<number>({
    reducer: overwriteReducer,
    default: () => 0,
  }),
})

export type AgentGraphState = typeof StateAnnotation.State

// TODO
export type ProcessOutput = {}

/**
 * Agent node types in the graph
 */
export type AgentNodeType =
  | "main_agent"
  | "kubernetes_agent"
  | "docker_agent"
  | "garden_agent"
  | "terraform_agent"
  | "human_in_the_loop"
  | "project_explorer"
  | "response_synthesizer"

/**
 * Tool types used by agents
 */
export interface AgentTool {
  name: string
  description: string
  schema: Record<string, unknown>
  handler: (input: unknown) => Promise<string>
}
