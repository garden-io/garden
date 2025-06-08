/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseAgent, type ToolHandler, type ToolDefinition } from "./base-agent.js"
import type { AgentResponse, MessageParam, AgentContext } from "../types.js"
import { KubernetesAgent } from "./kubernetes-agent.js"
import { DockerAgent } from "./docker-agent.js"
import { GardenAgent } from "./garden-agent.js"
import { TerraformAgent } from "./terraform-agent.js"

export class MainAgent extends BaseAgent {
  constructor(context: AgentContext, _projectRoot: string) {
    super(context, "main")
    // Use the projectRoot from BaseAgent which is already set in the parent constructor
  }

  override getName(): string {
    return "MainAgent"
  }

  override getDescription(): string {
    return "Main coordinator agent"
  }

  protected override getAdditionalToolHandlers(): Record<string, ToolHandler> {
    // MainAgent doesn't have additional tools beyond the base tools
    return {}
  }

  protected override getAdditionalTools(): ToolDefinition[] {
    // MainAgent doesn't define additional tools beyond the base tools
    return []
  }

  override getSystemPrompt(): string {
    return `You are the MainAgent, a DevOps AI assistant helping users with their infrastructure and development needs.
You coordinate with expert agents and have access to tools for exploring the project structure.

Your responsibilities:
1. Analyze user queries to understand their intent
2. Explore the project structure when needed using tools
3. Determine which expert agents to consult
4. Coordinate responses from multiple experts when necessary
5. Provide comprehensive answers to users

Available expert agents:
- KubernetesAgent: For Kubernetes configurations, deployments, and best practices
- DockerAgent: For Docker and container-related tasks
- GardenAgent: For Garden framework configuration and usage
- TerraformAgent: For Terraform infrastructure as code

You have access to file system tools:
- list_directory: List files and directories
- read_files: Read content of specific files
- write_file: Write content to files

Always be helpful, accurate, and thorough in your responses.`
  }

  override async processQuery(query: string, additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // Store user query in history
    this.addToHistory({ role: "user", content: query })

    try {
      // Determine if we need to explore the project structure
      const shouldExplore = await this.shouldExploreProject(query)

      let explorationResults = ""
      if (shouldExplore) {
        explorationResults = await this.exploreProjectWithTools(query)
      }

      // Determine which experts to consult
      const expertsToConsult = await this.determineExperts(query, explorationResults)

      // Consult the experts
      const expertResponses: Map<string, string> = new Map()
      for (const expert of expertsToConsult) {
        try {
          const agent = this.getExpertAgent(expert)
          const agentResponse = await agent.processQuery(query, {
            projectInfo: explorationResults,
            ...additionalContext,
          })
          expertResponses.set(expert, agentResponse.message)
        } catch (error) {
          this.context.log.warn(`Failed to consult ${expert}: ${error}`)
        }
      }

      // Synthesize final response
      const finalResponse = await this.synthesizeResponse(query, expertResponses, explorationResults)

      // Store assistant response in history
      this.addToHistory({ role: "assistant", content: finalResponse })

      return {
        message: finalResponse,
        actions: [],
      }
    } catch (error) {
      const errorMessage = `Error processing query: ${error instanceof Error ? error.message : String(error)}`
      this.context.log.error(errorMessage)
      return {
        message: errorMessage,
        actions: [],
      }
    }
  }

  async processUserInput(input: string): Promise<void> {
    this.context.log.info("")

    try {
      const response = await this.processQuery(input)

      // Display the response
      this.context.log.info(`Assistant: ${response.message}`)

      // Handle any actions
      if (response.actions && response.actions.length > 0) {
        for (const action of response.actions) {
          this.context.log.debug(`Would execute action: ${JSON.stringify(action)}`)
        }
      }
    } catch (error) {
      throw error
    }
  }

  private async shouldExploreProject(query: string): Promise<boolean> {
    const explorationPrompt = `Based on this user query, determine if you need to explore the project structure to provide a good answer.
Query: "${query}"

Respond with only "true" or "false".`

    const response = await this.callAnthropic([{ role: "user", content: explorationPrompt }])

    const content = response.content[0]
    return content.type === "text" && content.text.toLowerCase().includes("true")
  }

  private async exploreProjectWithTools(query: string): Promise<string> {
    const messages: MessageParam[] = [
      {
        role: "user",
        content: `Explore the project structure to understand what's in the project and help answer this query: "${query}"
        
Start by listing the root directory, then explore relevant subdirectories and read important configuration files.`,
      },
    ]

    const response = await this.callAnthropicWithTools(messages)

    const textContent = response.content.find((c) => c.type === "text")
    return textContent?.type === "text" ? textContent.text : ""
  }

  private async determineExperts(query: string, projectInfo: string): Promise<string[]> {
    const expertPrompt = `Based on the user query and project information, determine which expert agents should be consulted.
    
User Query: "${query}"

${projectInfo ? `Project Information:\n${projectInfo}\n` : ""}

Available experts:
- KubernetesAgent: For Kubernetes configurations, deployments, and best practices
- DockerAgent: For Docker and container-related tasks  
- GardenAgent: For Garden framework configuration and usage
- TerraformAgent: For Terraform infrastructure as code

Respond with a JSON array of expert names to consult, e.g., ["KubernetesAgent", "DockerAgent"]
If no specific expert is needed, respond with an empty array: []`

    const response = await this.callAnthropic([{ role: "user", content: expertPrompt }])

    try {
      const content = response.content[0]
      if (content.type === "text") {
        const experts = JSON.parse(content.text)
        return Array.isArray(experts) ? experts : []
      }
      return []
    } catch {
      return []
    }
  }

  private getExpertAgent(expertName: string): BaseAgent {
    switch (expertName) {
      case "KubernetesAgent":
        return new KubernetesAgent(this.context)
      case "DockerAgent":
        return new DockerAgent(this.context)
      case "GardenAgent":
        return new GardenAgent(this.context)
      case "TerraformAgent":
        return new TerraformAgent(this.context)
      default:
        throw new Error(`Unknown expert agent: ${expertName}`)
    }
  }

  private async synthesizeResponse(
    query: string,
    expertResponses: Map<string, string>,
    projectInfo: string
  ): Promise<string> {
    if (expertResponses.size === 0) {
      // No experts consulted, generate response directly
      const directPrompt = `Answer this user query based on the project information:
      
Query: "${query}"

${projectInfo ? `Project Information:\n${projectInfo}` : "No specific project information available."}

Provide a helpful and accurate response.`

      const directResponse = await this.callAnthropic([{ role: "user", content: directPrompt }])
      const directContent = directResponse.content[0]
      return directContent.type === "text" ? directContent.text : "I couldn't generate a response."
    }

    // Synthesize from expert responses
    let expertContext = "Expert responses:\n"
    for (const [expert, response] of expertResponses) {
      expertContext += `\n${expert}:\n${response}\n`
    }

    const synthesisPrompt = `Synthesize a comprehensive response to the user query based on expert agent responses.
    
User Query: "${query}"

${projectInfo ? `Project Information:\n${projectInfo}\n` : ""}

${expertContext}

Create a unified, coherent response that combines insights from all experts consulted.`

    const synthesisResponse = await this.callAnthropic([{ role: "user", content: synthesisPrompt }])
    const synthesisContent = synthesisResponse.content[0]
    return synthesisContent.type === "text"
      ? synthesisContent.text
      : "I couldn't synthesize a response from the experts."
  }
}
