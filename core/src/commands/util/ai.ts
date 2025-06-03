/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { printHeader } from "../../logger/util.js"
import dedent from "dedent"
import fsExtra from "fs-extra"
import { join } from "node:path"
import { Message, Tool, ToolUseBlock, type ToolUnion } from "@anthropic-ai/sdk/resources/index.js"
import { StringsParameter } from "../../cli/params.js"
import chalk from "chalk"

export const aiOpts = {}

type Opts = typeof aiOpts

// TODO: allow logging in at runtime
const anthropic = new Anthropic({})

const gardenDocs = `
## Docs overview
Garden is a CLI dev tool used to build, test and deploy Kubernetes apps. It leverages existing K8s manifests and Dockerfiles.

It's configured via garden.yml config files. Garden config files contain Build, Deploy, Run, and Test actions that describe a given part of a system. Usually there's a Garden config file for each service, co-located with that service. Garden parses this config and translates it into a graph it can execute.

## Garden project
Each Garden project has a top level project config file at the root of the repo, usually called \`project.garden.yml\`. This file contains high level config that's common to the project.

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
  command: [/bin/sh, -c, "echo 'hi \${local.user}'"] # Here we're using Garden template strings to print the username
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
kind: Project
name: real-world-example
environments: # Environments are required
  - name: dev
  - name: ci

defaultEnvironment: dev

providers:
  - name: kubernetes # This tells Garden to use this cluster in the dev environment
    environments: [dev]
    context: my-dev-cluster-contetx
    namespace: real-world-example-\${local.user} # Deploy to a namespace based on the user's name in the dev cluster
  - name: kubernetes # This tells Garden to use another cluster for CI
    environments: [ci]
    namespace: real-world-example-\${git.branch} # Deploy to a namespace based on the user's name in the CI cluster
    context: my-ci-cluster-contetx

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

const initPrompt = `
***START INIT PROMPT***
You are a Garden support engineer. Garden is a dev tools for Kubernetes.

Your task is to familiarise yourself with Garden via the docs below and then configure a Garden project in a git repository. You have several tools at your disposal.

Below are the Garden docs, you MUST only use these docs.

# Garden docs
${gardenDocs}

# Instructions
Follow the instructions below to configure a Garden project:

- Use the get_repo_file_tree tool to get repo file structure
- Then use the read_file tool to read relevant files such as Kubernetes manifests
- Then use the write_file tool to create the relevant garden.yml config files based on the repo contents, one file at a time. Use comments and placeholder values as needed. Only create Build, Deploy, and Test actions.
- After each garden.yml config file you create, use the garden_validate tool to validate the file
- If there's an error, fix the file and write it again with the write_file tool. If not, proceed to create the next garden.yml config file.
- Once if you added all necessary Garden config, you should stop.

You are operating from the repo root and all file paths are relative to that root. There will be back and forth and the prompt/context will grow as you use tools and they're output gets added.
***END INIT PROMPT***
`

const tools = [
  // {
  //   type: "web_search_20250305",
  //   name: "web_search",
  //   max_uses: 5,
  //   allowed_domains: ["github.com/garden-io/garden/tree/main/examples/k8s-deploy-patch-resources"],
  // },
  {
    name: "get_repo_file_tree",
    description: "Lists the relevant files in the repo. Skips non-relevant files such as node_modules and more",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "read_file",
    description: "Lists the relevant files in the repo. Skips non-relevant files such as node_modules and more",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "The relative path to the file that should be read",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Write the provided content to a file at the specified path",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The file contents to write",
        },
        file_path: {
          type: "string",
          description: "The path were the file should be written",
        },
      },
      required: ["content", "file_path"],
    },
  },
  {
    name: "garden_validate",
    description:
      "Validate all Garden config files in the project. Returns OK if config files are valid, otherwise an informative error",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
] as Array<ToolUnion>

const aiConfigGenArgs = {
  names: new StringsParameter({
    help: "FOOBAR",
  }),
}

type Args = typeof aiConfigGenArgs

export class AiConfigGenCommand extends Command<Args, Opts> {
  name = "ai-config"
  help = "[EXPERIMENTAL] Generate Garden config files using Anthropic's Claude AI"

  override noProject = true

  override description = dedent`
    Generate Garden config files using Anthropic's Claude AI.

    NOTE: THIS IS AN EXPERIMENTAL FEATURE.
  `

  override arguments = aiConfigGenArgs
  override options = aiOpts

  override printHeader({ log }) {
    printHeader(log, "AI", "🤖")
  }

  async action({ garden, log }: CommandParams<{}, Opts>): Promise<CommandResult> {
    log.info({ msg: `Hello from AI` })

    await gardenBot(garden.projectRoot)

    return {}
  }
}

interface ToolParams {
  rootDir: string
  input: any // TODO: typesafety
}

type ToolHandler = (params: ToolParams) => Promise<Message | string>

const toolMap: Record<string, ToolHandler> = {
  get_repo_file_tree: async ({ rootDir }) => {
    const files: string[] = []
    const ignoreList = [
      "node_modules",
      ".git",
      "policy",
      "garden.yml",
      "garden.yaml",
      "project.garden.yml",
      ".garden",
      ".DS_Store",
      ".grow",
    ]

    async function traverse(currentDir: string, relativePath: string = "") {
      const entries = await fsExtra.readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const entryName = entry.name

        if (ignoreList.includes(entryName)) {
          continue
        }

        const entryPath = join(currentDir, entryName)
        const entryRelativePath = join(relativePath, entryName)

        if (entry.isDirectory()) {
          await traverse(entryPath, entryRelativePath)
        } else {
          files.push(entryRelativePath)
        }
      }
    }

    // Start traversal from root directory
    await traverse(rootDir)

    return files.join("\n")
  },

  read_file: async (input: any) => {
    const path = input.file_path
    log(`Reading file at path: ${path}`)
    const content = (await fsExtra.readFile(path)).toString()

    return content
  },

  write_file: async (input: any) => {
    const path = `${input.file_path}`
    const content = input.content
    log(`Writing to file at path: ${path}`)
    // console.log(content)
    // console.log("")

    await fsExtra.writeFile(path, content)

    return "Successfully created file"
  },

  // TODO
  garden_validate: async () => "OK",
}

async function gardenBot(rootDir: string) {
  let prompt = initPrompt

  let useTool = true

  while (useTool) {
    const message = await promptClaude(prompt)

    // log(JSON.stringify(message, null, 4))

    prompt += `\nReply from Claude: ${JSON.stringify(message.content, null, 4)}`

    if (message.stop_reason === "tool_use") {
      const toolUses = message.content.filter((c) => c.type === "tool_use") as ToolUseBlock[]
      const tool = toolUses[toolUses.length - 1]
      const toolHandler = toolMap[tool.name]
      if (!toolHandler) {
        throw new Error(`Tool ${tool.name} not found in tool map`)
      }

      log(`Executing tool: ${tool.name}`)
      // log(`Executing tool: ${tool.name}, ${JSON.stringify(tool.input, null, 4)}`)

      const toolResult = (await toolHandler({ rootDir, input: tool.input as string })) as string
      console.log("")

      // log(`Got tool result:, ${toolResult}`)
      // log(`Got tool result:, ${toolResult.substring(0, 100)}...`)

      prompt += `\nResult from ${tool.name}:\n${toolResult}`
    } else {
      useTool = false
    }
  }

  log(`Done prompting, will exit`)
}

async function promptClaude(prompt: string) {
  const stream = anthropic.messages
    .stream({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      system: "You are a Garden support engineer, Garden is a dev tool for Kubernetes",
      tools,
      messages: [{ role: "user", content: prompt }],
    })
    .on("text", (text) => {
      process.stdout.write(text)
    })

  const message = await stream.finalMessage()

  process.stdout.write("\n\n")

  return message
}

function log(msg: string) {
  console.log(chalk.cyan("[INTERNAL]:", msg))
}
