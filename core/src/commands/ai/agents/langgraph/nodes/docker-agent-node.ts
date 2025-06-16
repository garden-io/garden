/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { NODE_NAMES } from "../../../types.js"
import { ExpertAgentNode } from "./expert-agent-node.js"

/**
 * Docker expert agent node
 */
export class DockerAgentNode extends ExpertAgentNode {
  getName() {
    return NODE_NAMES.DOCKER_AGENT
  }

  getAgentDescription(): string {
    return "Expert in Docker containerization, Dockerfile optimization, multi-stage builds, container security, Docker Compose, and image management. Consult for container-related tasks, Dockerfile creation, or Docker best practices."
  }

  getSystemPrompt(): string {
    return `You are an expert in Docker, containerization, and container build optimization.

Your expertise includes:
- Writing efficient Dockerfiles with multi-stage builds
- Container security best practices
- Image optimization and size reduction
- Docker Compose configurations
- Container networking and volumes
- Runtime security (non-root users, minimal base images)
- Container orchestration basics
- Debugging container issues

You have access to file system tools to read existing Dockerfiles and create new ones or overwrite existing ones.

Always prioritize security, efficiency, and maintainability in your recommendations.`
  }
}
