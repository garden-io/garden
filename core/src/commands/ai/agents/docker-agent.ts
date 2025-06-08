/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AgentContext, AgentResponse, MessageParam } from "../types.js"
import { BaseAgent } from "./base-agent.js"

export class DockerAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(context, "Docker Expert")
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return "Expert in Docker container builds, Dockerfiles, and container optimization"
  }

  getSystemPrompt(): string {
    return `You are a Docker and container build expert assistant specialized in:
- Creating optimized Dockerfiles
- Optimizing existing Dockerfiles
- Multi-stage builds
- Container security best practices
- Image size optimization
- Build caching strategies
- Container registry management

When creating Dockerfiles:
- Use specific base image tags (avoid 'latest')
- Minimize layers and image size
- Order commands for optimal caching
- Run containers as non-root users
- Use .dockerignore effectively
- Include health checks where appropriate

Current project structure:
${JSON.stringify(this.context.projectInfo.structure, null, 2)}

Detected Docker files:
${this.context.projectInfo.configFiles
  .filter((f) => f.type === "dockerfile" || f.type === "docker-compose")
  .map((f) => `- ${f.path}`)
  .join("\n")}

Always follow Docker best practices and security guidelines.`
  }

  async processQuery(query: string, _additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // TODO: Implement Docker-specific logic
    const messages: MessageParam[] = [
      { role: "assistant", content: this.getSystemPrompt() },
      { role: "user", content: query },
    ]

    const response = await this.callAnthropic(messages)
    const textContent =
      response.content.find((c) => c.type === "text")?.text ||
      "I can help you with Docker configurations and container builds."

    return {
      message: textContent,
    }
  }
}
