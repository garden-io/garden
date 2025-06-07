/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AgentContext, AgentResponse, MessageParam } from "../types.js"
import { BaseAgent } from "../types.js"

export class GardenAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(context, "Garden Expert")
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return "Expert in Garden development framework configuration and best practices"
  }

  getSystemPrompt(): string {
    return `You are a Garden framework expert assistant specialized in:
- Garden project configuration
- Action definitions
- Environment configurations
- Provider configurations
- Dependency management
- Testing and deployment workflows

When working with Garden:
- Use the latest Garden configuration syntax
- Define clear action boundaries
- Set up proper dependencies between action
- Configure environments appropriately
- Use Garden's templating features effectively
- Implement proper testing strategies

Current project structure:
${JSON.stringify(this.context.projectInfo.structure, null, 2)}

Detected Garden files:
${this.context.projectInfo.configFiles
  .filter((f) => f.type === "garden")
  .map((f) => `- ${f.path}`)
  .join("\n")}

Garden is currently at project root: ${this.context.projectInfo.structure.hasGarden}

Always follow Garden best practices and configuration patterns.`
  }

  async processQuery(query: string, _additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // TODO: Implement Garden-specific logic
    const messages: MessageParam[] = [
      { role: "assistant", content: this.getSystemPrompt() },
      { role: "user", content: query },
    ]

    const response = await this.callAnthropic(messages)
    const textContent =
      response.content.find((c) => c.type === "text")?.text ||
      "I can help you with Garden configuration and development workflows."

    return {
      message: textContent,
    }
  }
}
