/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "../base.js"
import type { CommandParams, CommandResult } from "../base.js"
import type { AgentContext } from "./types.js"
import { FilesystemScanner } from "./filesystem-scanner.js"
import { createAgentGraph } from "./agents/langgraph/graph.js"
import Anthropic from "@anthropic-ai/sdk"
import chalk from "chalk"
import { printHeader } from "../../logger/util.js"
import dedent from "dedent"
import { BooleanParameter } from "../../cli/params.js"
import type { AgentGraphState } from "./agents/langgraph/types.js"

export const agentArgs = {}
export const agentOpts = {
  yolo: new BooleanParameter({
    help: "Overwrite files without confirmation",
    defaultValue: false,
  }),
}

type Args = typeof agentArgs
type Opts = typeof agentOpts

export class AgentCommand extends Command<Args, Opts> {
  name = "agent"
  help = "[EXPERIMENTAL] DevOps AI assistant powered by Anthropic's Claude"

  override noProject = true

  override description = dedent`
    An interactive DevOps AI assistant that helps you create and improve:
    - Kubernetes manifests
    - Container builds and Dockerfiles
    - Garden configurations
    - Terraform infrastructure

    The agent will scan your project structure and provide context-aware assistance.
  `

  override aliases = ["ai"]

  override arguments = agentArgs
  override options = agentOpts

  override printHeader({ log }) {
    printHeader(log, "DevOps AI Assistant", "🤖")
  }

  async action({ garden, log, opts }: CommandParams<Args, Opts>): Promise<CommandResult> {
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      log.error(chalk.red("Error: ANTHROPIC_API_KEY environment variable is not set."))
      log.info(chalk.yellow("Please set your Anthropic API key to use this feature."))
      return { exitCode: 1 }
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({})

    // Initialize the filesystem scanner
    const scanner = new FilesystemScanner(garden.projectRoot, log)

    // Scan the project structure
    log.info(chalk.cyan("Scanning project structure..."))
    const projectInfo = await scanner.scan()

    // Create the agent context
    const context: AgentContext = {
      anthropic,
      projectRoot: garden.projectRoot,
      projectInfo,
      log,
      garden,
      yolo: opts.yolo,
    }

    // Create the LangGraph agent network
    const agentGraph = createAgentGraph(context)

    // Welcome message
    log.info("")
    log.info(chalk.green("Welcome to the DevOps AI Assistant!"))
    log.info(chalk.gray("I can help you create and improve Kubernetes, Docker, Garden, and Terraform configurations."))
    log.info(chalk.gray("Type 'exit' or 'quit' at the prompt to end the session."))
    log.info("")

    if (opts.yolo) {
      log.info(
        chalk.yellow(
          "\nWARNING: YOLO mode is enabled. This will overwrite files without confirmation. Kindly make sure you can undo any changes (say, by having your files under version control).\n"
        )
      )
    }

    // Initialize the conversation state
    const initialState: AgentGraphState = {
      initialUserQuery: "",
      messages: [],
      expertsConsulted: [],
      context,
      step: 0,
      userFeedback: undefined,
    }

    try {
      // Run the graph in a streaming fashion
      const stream = await agentGraph.stream(initialState, {
        streamMode: "debug",
        debug: true,
      })

      // Process the stream
      for await (const state of stream) {
        // console.log("state", state)
        // The human-in-the-loop node will handle user interaction
        // and the graph will continue until the user exits
        // TODO: allow main agent to summarize the conversation and provide a final response
        if (state.userFeedback === "quit") {
          break
        }
      }
    } catch (error) {
      log.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`))
      log.debug(`Full error: ${error}`)
      return { exitCode: 1 }
    }

    return {}
  }
}
