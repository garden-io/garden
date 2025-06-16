/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { NODE_NAMES } from "../../../types.js"
import { ExpertAgentNode } from "./expert-agent-node.js"
import type { AgentContext } from "../../../types.js"
import type { BaseToolParams } from "./tools.js"
import { writeFile } from "./tools.js"
import { ValidateCommand } from "../../../../validate.js"
import { Garden } from "../../../../../garden.js"
import { LogLevel, VoidLogger } from "../../../../../logger/logger.js"
import stripAnsi from "strip-ansi"
import { DynamicStructuredTool } from "@langchain/core/tools"
import z from "zod"
import type { ChatAnthropic } from "@langchain/anthropic"

/**
 * Garden framework expert agent node
 */
export class GardenAgentNode extends ExpertAgentNode {
  constructor(context: AgentContext, model: ChatAnthropic) {
    super(context, model)
    // Override tools with Garden-specific tools that include validation
    this.tools.push(
      // Garden validate tool
      new DynamicStructuredTool({
        name: "garden_validate",
        description:
          "Validate all Garden config files in the project. Returns 'OK' if config files are valid, otherwise an informative error message.",
        schema: z.object({}), // No parameters needed
        func: async () => {
          return gardenValidate({ context })
        },
      }),

      // Write file and validate tool
      new DynamicStructuredTool({
        name: "write_file_and_validate",
        description:
          "Write content to a file and then validate all Garden config files in one go. Takes the same inputs as write_file but also validates the configuration after writing.",
        schema: z.object({
          filePath: z.string().describe("The file path to write to"),
          content: z.string().describe("The content to write"),
          force: z.boolean().optional().describe("Whether to overwrite existing file without confirmation"),
        }),
        func: async ({ filePath, content, force }) => {
          return writeFileAndValidate({ context, filePath, content, force: force || context.yolo })
        },
      })
    )
  }

  getName() {
    return NODE_NAMES.GARDEN_AGENT
  }

  getAgentDescription(): string {
    return "Expert in Garden development framework, garden.yml configurations, action definitions, workflows, environment management, and CI/CD integration. Consult for Garden project setup, configuration optimization, or development workflow questions."
  }

  getSystemPrompt(): string {
    return `You are the Garden agent, an expert in the Garden development framework.

Your expertise includes:
- Garden project configuration (project.garden.yml file)
- Action configurations (Build, Deploy, Test, Run actions in garden.yml files)
- Garden workflows and automation (workflows.garden.yml file)
- Garden provider configurations (kubernetes, local, etc.)
- Garden CLI commands and options
- Best practices for Garden projects
- Integration with Kubernetes and other platforms

Below are the Garden docs, you MUST only use these docs, except when given a URL in the output from the garden_validate tool.
---------------------------------------------------------
${gardenDocs}
---------------------------------------------------------

# Instructions
Follow the instructions below to configure a Garden project:

- You may already have information about the project from the user and/or the ${NODE_NAMES.PROJECT_EXPLORER} agent. Use this information if available.
- You may also use the listDirectory tool to get repo file structure
- Then use the read_files tool to read relevant files such as Kubernetes manifests
- Then use the write_file tool to create a Project configuration. This should be named project.garden.yml. Use comments and placeholder values as needed.
- Then use the write_file tool to create the relevant config files for each action based on the repo contents, one file at a time. Use comments and placeholder values as needed. Only create Build, Deploy, and Test actions. The file MUST be named garden.yml.
- After each config file you create, including the project.garden.yml, use the garden_validate tool to validate the file
  - If there's an error (i.e. the tool returns an error message instead of just "OK"):
    - Read the tool output to understand the error. If the output contains a URL, open it in your browser to read the suggested docs. You MUST tell the user that you did this and which URL you opened.
    - Fix the file and summarize the changes in a short description.
    - Write it again with the write_file tool, this time with force=true as an input.
    - Run the garden_validate tool again to validate the file
    - Repeat the above until there is no error
  - If there is no error, proceed to create the next config file.
- Once if you added all necessary Garden config, you should stop.

You are operating from the repo root and all file paths are relative to that root. There will be back and forth and the prompt/context will grow as you use tools and they're output gets added.

DO NOT create Kubernetes manifests if they already exist.

When possible, use the write_file_and_validate tool instead of write_file and garden_validate separately.

When there are existing Kubernetes manifests for a service, you should reference them in the Garden config file with \`spec.manifestFiles\` and then use \`spec.patchResources\` to override values in the manifest as needed (e.g. the container image, service hostnames if applicable etc).

In your responses, DO NOT repeat the prompt that you received or the results from tools used.

You have access to file system tools to read existing Garden configurations and create new ones.

Help users set up and optimize their Garden projects for efficient development workflows.`
  }
}

// Garden-specific tool parameters
type GardenValidateParams = BaseToolParams

interface WriteFileAndValidateParams extends BaseToolParams {
  filePath: string
  content: string
  force?: boolean
}

// Garden-specific tool functions
export async function gardenValidate({ context }: GardenValidateParams): Promise<string> {
  const log = context.log.createLog({ origin: "garden_validate" })

  log.info("Running 'garden validate'")

  const validateCommand = new ValidateCommand()

  try {
    const garden = await Garden.factory(context.projectRoot, {
      commandInfo: {
        name: "validate",
        args: {},
        opts: {},
      },
    })

    const logger = new VoidLogger({ level: LogLevel.info })

    await validateCommand.action({
      garden,
      log: logger.createLog(),
      args: {},
      opts: {
        "resolve": [],
        "silent": true,
        "offline": false,
        "logger-type": "console",
        "yes": false,
        "log-level": "info",
        "emoji": false,
        "show-timestamps": false,
        "output": "",
        "version": false,
        "help": false,
        "root": context.projectRoot,
        "env": "default",
        "force-refresh": true,
        "var": [],
      },
    })

    log.info("✅ Successfully validated Garden config")
    return "OK"
  } catch (error) {
    let errorMessage = "'garden validate' failed with error"

    if (error instanceof Error) {
      errorMessage += `:\n${error.toString()}`
    } else {
      errorMessage += `:\n${error}`
    }

    log.warn(`❌ Garden validation failed: ${errorMessage}`)
    return stripAnsi(errorMessage)
  }
}

export async function writeFileAndValidate({
  context,
  filePath,
  content,
  force = false,
}: WriteFileAndValidateParams): Promise<string> {
  const log = context.log.createLog({ origin: "write_file_and_validate" })

  // First, write the file using our existing writeFile function
  const writeResult = await writeFile({ context, filePath, content, force })

  // Check if write was successful
  if (writeResult.includes("❌")) {
    return writeResult // Return early if write failed
  }

  log.info("File written successfully, proceeding to validation")

  // Then validate the Garden configuration
  const validateResult = await gardenValidate({ context })

  return validateResult
}

const gardenDocs = `
## Docs overview
Garden is a CLI dev tool used to build, test and deploy Kubernetes apps. It leverages existing K8s manifests and Dockerfiles.

It's configured via garden.yml config files. Garden config files contain Build, Deploy, Run, and Test actions that describe a given part of a system. Usually there's a Garden config file for each service, co-located with that service. Garden parses this config and translates it into a graph it can execute.

## Garden project
Each Garden project has a top level project config file at the root of the repo, usually called \`project.garden.yml\`. This file contains high level config that's common to the project. There is no \`description\` field in the project config.

## Garden actions
Each Garden project has one or more actions actions which are the building blocks of a Garden project. They all have the same structure, can depend on other actions and define outputs that other actions can read.

## Trivial example
Following is a trivial example that shows how actions are structured and can reference one another. It's not very useful though.

\`\`\`yaml
# In garden.yml

kind: Run # Required field, one of Build, Deploy, Test, Run
name: say-hi # Required field
type: exec # Required field, depends on the kind. The most used types are exec, container, kubernetes, helm
description: An exec action that prints the shell username # Optional
spec: # All actions have a spec field and it's shape depends on the action kind and type
  command: [/bin/sh, -c, "echo 'hi \${local.username}'"] # Here we're using Garden template strings to print the username
---
kind: Run
name: echo-say-hi
type: exec
dependencies: [say-hi] # We need to tell Garden that this action depends on say-hi and that it should run first
description: An exec action that depends on the say-hi action and prints it's output
spec:
  command: [/bin/sh, -c, "echo 'Action \${actions.run.say-hi.name} says: \${actions.run.say-hi.outputs.log}'"] # Here we're referencing the output of the say-hi action and printing it
\`\`\`

Now if the user runs \`garden run echo-say-hi\`, Garden will first execute the say-hi action and then the echo-say-hi action.

## Real world example
Following is a real world example (but a relatively simple one). This is the main use case for Garden using it to build, deploy and test K8s apps by leveraging existing Helm charts, Dockerfiles and K8s manifests. Note that the exmaple is split into several files which is a Garden convention.

\`\`\`yaml
# project.garden.yml
apiVersion: garden.io/v2
kind: Project
name: real-world-example
environments: # Environments are required
  - name: local
  - name: dev
  - name: ci

defaultEnvironment: local

providers:
  - name: local-kubernetes # This tells Garden to use a local Kubernetes installation for dev
    environments: [local]
    namespace: \${project.name}
  - name: kubernetes # This tells Garden to use this Kubernetes cluster for remote dev
    environments: [dev]
    namespace: \${project.name}-\${local.username} # Deploy to a namespace based on the user's name in the dev cluster
  - name: kubernetes # This tells Garden to use another cluster for CI
    environments: [ci]
    namespace: \${project.name}-\${git.branch} # Deploy to a namespace based on the git branch in the CI cluster
    context: my-ci-cluster-context

# In db/garden.yml
kind: Deploy
type: helm # Here we're executing a helm action. This essentially tells Garden to install this Helm chart
name: redis
spec:
  chart:
    name: redis
    repo: https://charts.bitnami.com/bitnami
    version: "16.13.1"
  values:
    auth:
      enabled: false

# In api/garden.yml
kind: Build
type: container # The API container
name: api
spec:
  dockerfile: ./Dockerfile # You can actually skip this since it's the default value
---
kind: Deploy
type: kubernetes # Here we're executing a kubernetes action which essentially tells Garden to run kubectl apply under the hood
name: api
dependencies: [build.api, deploy.redis] # We need to make sure Garden builds the API before deploying it. We also want to deploy redis ahead of the API
spec:
  manifestFiles: [./manifests/**/*] # The path to the Kubernetes manifests relevant to this action
  patchResources: # Override some values from the manifest. In particular we want to make sure to the the container image to be the one we just built. Garden generates the image tag and pushes the images in the Build action. Works the same as \`kubectl patch\`. Can also be used to e.g. set resources based on environment.
    - name: api # The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # The kind of the resource to patch
      patch:
        spec:
          template:
            spec:
              containers:
                - name: api # Should match the container name from the K8s manifest
                  image: \${actions.build.api.outputs.deploymentImageId} # This is the value we want to override using the output from the Build action above
---
kind: Test
type: container # This action tells Garden to run this container using the command specified below in the K8s cluster and return the results.
name: api-unit
dependencies: [build.api]
spec:
  image: \${actions.build.api.outputs.deploymentImageId} # Use the API container and run the test command inside it.
  command: [npm, run, test:unit]

# In web/garden.yml
kind: Build
type: container # The Web container
name: web
---
kind: Deploy
type: kubernetes # Here we're executing a kubernetes action which essentially tells Garden to run kubectl apply under the hood
name: web
dependencies: [build.web, deploy.web] # We need to make sure Garden builds the web image before deploying it. We also want to deploy the API ahead of the web frontend
spec:
  manifestFiles: [./manifests/**/*]
  patchResources:
    - name: web # The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # The kind of the resource to patch
      patch:
        spec:
          template:
            spec:
              containers:
                - name: web # Should match the container name from the K8s manifest
                  image: \${actions.build.web.outputs.deploymentImageId} # The output from the Build action above
kind: Test
type: container
name: web-e2e
dependencies: [build.web, deploy.web] # Build and deploy the web (and by extension the other services, dependencies are transitive) before running e2e tests
spec:
  image: \${actions.build.web.outputs.deploymentImageId} # Use the web container and run the test command inside it
  command: [npm, run, test:e2e]
\`\`\`

Now if you run \`garden deploy\` in the project it will build all the container images and deploy Redis and the services in the correct order to the real-world-example-myusername namespace in the dev cluster.

If you run \`garden deploy --env ci\` in the project it will do the same in the real-world-example-mybranch namespace in the CI cluster.

Similarly you can run \`garden test\` or \`garden test web-e2e\` to test the project. The tests run inside the relevant K8s cluster.

## Misc notes
Garden actions can only reference files in the same directory or below. If you have a Garden file in a directory like \`api/garden.yml\` but need to reference, say, a Dockerfile in the root of the project under \`dockerfiles/api.Dockerfile\` you can manually specify the action root like so:

\`\`\`yaml
# In api/garden.yml
kind: Build
type: container
name: api
source:
  path: ../ # Set the action path to the root. Now all files referenced in this action are relevant to the root.
spec:
  dockerfile: ./dockerfiles/api.Dockerfile
\`\`\`
`
