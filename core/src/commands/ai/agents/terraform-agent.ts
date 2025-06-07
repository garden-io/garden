/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AgentContext, AgentResponse, MessageParam } from "../types.js"
import { BaseAgent } from "../types.js"

export class TerraformAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(context, "Terraform Expert")
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return "Expert in Terraform infrastructure as code and cloud provider configurations"
  }

  getSystemPrompt(): string {
    return `You are a Terraform infrastructure expert assistant specialized in:
- Terraform configuration and best practices
- Cloud provider resources (AWS, Azure, GCP)
- Module design and reusability
- State management
- Provider configurations
- Resource dependencies and lifecycle

When working with Terraform:
- Use the latest Terraform syntax (HCL2)
- Follow the principle of least privilege for IAM
- Implement proper state management strategies
- Use modules for reusable components
- Tag resources appropriately
- Implement proper variable and output definitions
- Consider cost optimization

Current project structure:
${JSON.stringify(this.context.projectInfo.structure, null, 2)}

Detected Terraform files:
${this.context.projectInfo.configFiles
  .filter((f) => f.type === "terraform")
  .map((f) => `- ${f.path}`)
  .join("\n")}

Always follow Terraform best practices and security guidelines.`
  }

  async processQuery(query: string, _additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // TODO: Implement Terraform-specific logic
    const messages: MessageParam[] = [
      { role: "assistant", content: this.getSystemPrompt() },
      { role: "user", content: query },
    ]

    const response = await this.callAnthropic(messages)
    const textContent =
      response.content.find((c) => c.type === "text")?.text ||
      "I can help you with Terraform configurations and infrastructure as code."

    return {
      message: textContent,
    }
  }
}
