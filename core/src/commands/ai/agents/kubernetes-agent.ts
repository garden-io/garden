/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { AgentContext, AgentResponse, MessageParam } from "../types.js"
import { BaseAgent } from "./base-agent.js"

export class KubernetesAgent extends BaseAgent {
  constructor(context: AgentContext) {
    super(context, "Kubernetes Expert")
  }

  getName(): string {
    return this.name
  }

  getDescription(): string {
    return "I specialize in Kubernetes manifests, deployments, services, and cloud-native configurations"
  }

  getSystemPrompt(): string {
    return `You are a Kubernetes expert assistant specialized in:
- Creating and optimizing Kubernetes manifests (Deployments, Services, ConfigMaps, Secrets, etc.)
- Best practices for container orchestration
- Resource management and scaling configurations
- Security policies and RBAC
- Debugging Kubernetes issues

When generating Kubernetes configurations:
- Use the latest stable API versions
- Include appropriate labels and selectors
- Add resource limits and requests
- Follow security best practices (non-root containers, read-only filesystems where possible)
- Include health checks and probes
- Use appropriate restart policies

Current project structure:
${JSON.stringify(this.context.projectInfo.structure, null, 2)}

Detected Kubernetes files:
${this.context.projectInfo.configFiles
  .filter((f) => f.type === "kubernetes")
  .map((f) => `- ${f.path}`)
  .join("\n")}

Always validate YAML syntax and Kubernetes API compatibility.`
  }

  async processQuery(query: string, _additionalContext?: Record<string, unknown>): Promise<AgentResponse> {
    // TODO: Implement Kubernetes-specific logic
    const messages: MessageParam[] = [
      { role: "assistant", content: this.getSystemPrompt() },
      { role: "user", content: query },
    ]

    const response = await this.callAnthropic(messages)
    const textContent =
      response.content.find((c) => c.type === "text")?.text || "I need more information to help with Kubernetes."

    return {
      message: textContent,
    }
  }
}
