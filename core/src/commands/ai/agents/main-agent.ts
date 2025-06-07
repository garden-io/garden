/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AgentContext, AgentResponse, AgentAction } from "../types.js"
import { BaseAgent } from "../types.js"
import { KubernetesAgent } from "./kubernetes-agent.js"
import { DockerAgent } from "./docker-agent.js"
import { GardenAgent } from "./garden-agent.js"
import { TerraformAgent } from "./terraform-agent.js"
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs"
import chalk from "chalk"
import { uniq } from "lodash-es"

export class MainAgent extends BaseAgent {
  private expertAgents: Map<string, BaseAgent>

  constructor(context: AgentContext) {
    super(context, "Main Agent")

    // Initialize expert agents
    this.expertAgents = new Map([
      ["kubernetes", new KubernetesAgent(context)],
      ["docker", new DockerAgent(context)],
      ["garden", new GardenAgent(context)],
      ["terraform", new TerraformAgent(context)],
    ])
  }

  getName(): string {
    return "Main DevOps Assistant"
  }

  getDescription(): string {
    return "I coordinate between specialized experts to help you with your DevOps needs"
  }

  getSystemPrompt(): string {
    return `You are a helpful DevOps AI assistant that helps users create and improve infrastructure as code.

You have access to information about the user's project structure:
${JSON.stringify(this.context.projectInfo, null, 2)}

You coordinate between different expert agents:
- Kubernetes Expert: For Kubernetes manifests and configurations
- Docker Expert: For Dockerfiles and container builds
- Garden Expert: For Garden configuration and workflows
- Terraform Expert: For Terraform infrastructure as code

Your role is to:
1. Understand what the user wants to achieve
2. Analyze their existing project structure
3. Decide which expert agent(s) should handle the request
4. Coordinate between multiple experts if needed
5. Ask clarifying questions when necessary

When responding, be concise and helpful. If you need to delegate to an expert, explain what you're doing.

Always consider the existing project structure and configuration files when making recommendations.`
  }

  async processUserInput(input: string): Promise<void> {
    this.context.log.info("")

    try {
      const response = await this.processQuery(input)

      // Display the response
      this.context.log.info(chalk.green("Assistant: ") + response.message)

      // Handle any actions
      if (response.actions && response.actions.length > 0) {
        for (const action of response.actions) {
          await this.executeAction(action)
        }
      }

      // Handle additional user input if needed
      if (response.needsUserInput && response.userPrompt) {
        // This would be handled by the main command loop
        this.context.log.info(chalk.yellow(`\n${response.userPrompt}`))
      }
    } catch (error) {
      throw error
    }
  }

  async processQuery(query: string, additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // Add user message to history
    this.addToHistory({ role: "user", content: query })

    // Determine which expert(s) to consult
    const expertDecision = await this.determineExperts(query)

    if (expertDecision.needsClarification) {
      return {
        message:
          expertDecision.clarificationMessage || "Could you please provide more details about what you'd like to do?",
        needsUserInput: true,
      }
    }

    if (expertDecision.experts.length === 0) {
      // Handle the query directly
      const response = await this.handleDirectly(query)
      return response
    }

    // Delegate to expert(s)
    const finalResponse: AgentResponse = {
      message: "",
      actions: [],
    }

    for (const expertName of expertDecision.experts) {
      const expert = this.expertAgents.get(expertName)
      if (expert) {
        this.context.log.debug(`Consulting ${expert.getName()}...`)

        const expertResponse = await expert.processQuery(query, {
          ...additionalContext,
          projectInfo: this.context.projectInfo,
        })

        // Combine responses
        if (finalResponse.message) {
          finalResponse.message += "\n\n"
        }
        finalResponse.message += expertResponse.message

        if (expertResponse.actions) {
          finalResponse.actions = [...(finalResponse.actions || []), ...expertResponse.actions]
        }

        if (expertResponse.needsUserInput) {
          finalResponse.needsUserInput = true
          finalResponse.userPrompt = expertResponse.userPrompt
        }
      }
    }

    // Add assistant response to history
    this.addToHistory({ role: "assistant", content: finalResponse.message })

    return finalResponse
  }

  private async determineExperts(query: string): Promise<{
    experts: string[]
    needsClarification: boolean
    clarificationMessage?: string
  }> {
    // Create a prompt to determine which experts to consult
    const messages: MessageParam[] = [
      {
        role: "user",
        content: `Given this user query: "${query}"

And this project information:
- Has Kubernetes configs: ${this.context.projectInfo.structure.hasKubernetes}
- Has Docker configs: ${this.context.projectInfo.structure.hasDocker}
- Has Garden configs: ${this.context.projectInfo.structure.hasGarden}
- Has Terraform configs: ${this.context.projectInfo.structure.hasTerraform}

Which expert agents should handle this query? Response with a JSON object:
{
  "experts": ["kubernetes", "docker", "garden", "terraform"], // array of expert names needed, can be empty
  "needsClarification": false, // true if the query is too vague
  "clarificationMessage": "" // optional message if clarification is needed
}

Only include experts that are relevant to the query. If the query is general or about the project structure, return an empty experts array.`,
      },
    ]

    const response = await this.callAnthropic(messages)

    try {
      // Parse the JSON response
      const textContent = response.content.find((c) => c.type === "text")?.text || "{}"
      const jsonMatch = textContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const decision = JSON.parse(jsonMatch[0])
        return {
          experts: decision.experts || [],
          needsClarification: decision.needsClarification || false,
          clarificationMessage: decision.clarificationMessage,
        }
      }
    } catch (error) {
      this.context.log.debug(`Error parsing expert decision: ${error}`)
    }

    // Default: try to infer from keywords
    const lowerQuery = query.toLowerCase()
    let experts: string[] = []

    if (
      lowerQuery.includes("kubernetes") ||
      lowerQuery.includes("k8s") ||
      lowerQuery.includes("deployment") ||
      lowerQuery.includes("service")
    ) {
      experts.push("kubernetes")
    }
    if (lowerQuery.includes("docker") || lowerQuery.includes("container") || lowerQuery.includes("dockerfile")) {
      experts.push("docker")
    }
    if (lowerQuery.includes("garden")) {
      experts.push("garden")
    }
    if (lowerQuery.includes("terraform") || lowerQuery.includes("infrastructure")) {
      experts.push("terraform")
    }

    experts = uniq(experts)

    return { experts, needsClarification: false }
  }

  private async handleDirectly(_query: string): Promise<AgentResponse> {
    // Handle general queries directly
    const messages: MessageParam[] = this.conversationHistory

    const response = await this.callAnthropic(messages)
    const textContent = response.content.find((c) => c.type === "text")?.text || "I'm not sure how to help with that."

    return {
      message: textContent,
    }
  }

  private async executeAction(action: AgentAction): Promise<void> {
    // TODO: Implement action execution
    this.context.log.debug(`Would execute action: ${JSON.stringify(action)}`)
  }
}
