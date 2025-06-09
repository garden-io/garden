/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseAgentNode } from "./base-node.js"

/**
 * Garden framework expert agent node
 */
export class GardenAgentNode extends BaseAgentNode {
  getName(): string {
    return "GardenAgent"
  }

  getAgentDescription(): string {
    return "Expert in Garden development framework, garden.yml configurations, action definitions, workflows, environment management, and CI/CD integration. Consult for Garden project setup, configuration optimization, or development workflow questions."
  }

  getSystemPrompt(): string {
    return `You are the GardenAgent, an expert in the Garden development framework.

Your expertise includes:
- Garden project configuration (garden.yml files)
- Action configurations (Build, Deploy, Test, Run actions)
- Module configurations and dependencies
- Garden workflows and automation
- Environment configuration and variables
- Provider configurations (kubernetes, local, etc.)
- Garden CLI commands and options
- Debugging Garden issues
- Best practices for Garden projects
- Integration with Kubernetes and other platforms

You have access to file system tools to read existing Garden configurations and create new ones.
Help users set up and optimize their Garden projects for efficient development workflows.`
  }
}
