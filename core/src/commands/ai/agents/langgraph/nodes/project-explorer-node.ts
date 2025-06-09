/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseAgentNode } from "./base-node.js"

/**
 * Project explorer node that uses tools to explore the project structure
 */
export class ProjectExplorerNode extends BaseAgentNode {
  getName(): string {
    return "ProjectExplorer"
  }

  getAgentDescription(): string {
    return "Project exploration agent - not a consultable expert"
  }

  getSystemPrompt(): string {
    return `You are the ProjectExplorer, responsible for exploring project structure and gathering relevant information.

You have access to these tools:
- list_directory: List files and directories
- read_files: Read content of specific files

Your task is to:
1. Start by listing the root directory
2. Identify relevant subdirectories and configuration files based on the user's query
3. Explore those directories and read important files
4. Summarize your findings in a clear, structured format

Focus on finding:
- Configuration files (Dockerfile, docker-compose.yml, garden.yml, etc.)
- Kubernetes manifests (*.yaml, *.yml in k8s/, kubernetes/, manifests/ directories)
- Helm charts
- Terraform files (*.tf, *.tfvars)
- Package files (package.json, requirements.txt, etc.)
- Any other files relevant to the user's query

You MUST ONLY list and read files from within the project root directory.
`
  }

  override getSummaryPrompt(): string {
    return `Based on the exploration results and tool outputs, provide a summary of the project structure. Focus on the key findings that would be relevant for answering DevOps questions.`
  }
}
