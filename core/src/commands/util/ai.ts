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
import type { ToolUseBlock } from "@anthropic-ai/sdk/resources/index.js"
import { type ToolUnion } from "@anthropic-ai/sdk/resources/index.js"
import { StringsParameter } from "../../cli/params.js"
import chalk from "chalk"
import * as readline from "node:readline/promises"
import { stdin as inputRL, stdout as outputRL } from "node:process"
import { Garden } from "../../garden.js"
import { ValidateCommand } from "../validate.js"
import type { Log } from "../../logger/log-entry.js"
import stripAnsi from "strip-ansi"
import { LogLevel, VoidLogger } from "../../logger/logger.js"
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs"

export const aiOpts: Record<string, never> = {}

type Opts = typeof aiOpts

const aiConfigGenArgs = {
  names: new StringsParameter({
    help: "Names of items to generate config for (e.g. service names, directories)",
  }),
}
type Args = typeof aiConfigGenArgs

export class AiConfigGenCommand extends Command<Args, Opts> {
  name = "ai-config-gen"
  help = "[EXPERIMENTAL] Generate Garden config files using Anthropic's Claude AI"

  override noProject = true

  override description = dedent`
    Generate Garden config files using Anthropic's Claude AI.

    Currently this requires you to have an Anthropic API key set in the environment variable ANTHROPIC_API_KEY. You can get an API key from https://console.anthropic.com/api-keys. You will also need some credits in your Anthropic account.

    The command also currently assumes that you have some flavor of Kubernetes running locally, such as Minikube, Docker Desktop, Orbstack etc.

    NOTE: THIS IS AN EXPERIMENTAL FEATURE.
  `

  override arguments = aiConfigGenArgs
  override options = aiOpts

  override printHeader({ log }) {
    printHeader(log, "AI Config Generator", "🤖")
  }

  async action({ garden, log }: CommandParams<Args, Opts>): Promise<CommandResult> {
    await gardenBot(garden.projectRoot, log)

    return {}
  }
}

// TODO: allow logging in at runtime
const anthropic = new Anthropic({})

// TODO: can we reference the public docs? Or just the docs directory in the repo perhaps
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

const initPrompt = `
***START INIT PROMPT***
You are a Garden support engineer. Garden is a dev tools for Kubernetes.

Your task is to familiarise yourself with Garden via the docs below and then configure a Garden project in a git repository. You have several tools at your disposal.

Below are the Garden docs, you MUST only use these docs, except when given a URL in the output from garden_validate.

# Garden docs
${gardenDocs}

# Instructions
Follow the instructions below to configure a Garden project:

- Use the get_repo_file_tree tool to get repo file structure
- Then use the read_files tool to read relevant files such as Kubernetes manifests
- Then use the write_file tool to create a Project configuration. This should be named project.garden.yml.
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

When possible, use the write_file_and_validate tool instead of write_file and garden_validate separately.

In your responses, DO NOT repeat the prompt that you received or the results from tools used.
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
    name: "read_files",
    description:
      "Reads the content of one or more specified files and returns the contents as a JSON object keyed by file path. Input is an array of relative file paths.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_paths: {
          type: "array",
          items: { type: "string" },
          description: "An array of relative paths to the files that should be read",
        },
      },
      required: ["file_paths"],
    },
  },
  {
    name: "write_file",
    description: `Write the provided content to a file at the specified path. \
Use force=true to skip overwrite confirmation.`,
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The file contents to write",
        },
        file_path: {
          type: "string",
          description: "The path where the file should be written",
        },
        force: {
          type: "boolean",
          description: "If true, skip the overwrite confirmation prompt and write the file directly.",
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
  {
    name: "write_file_and_validate",
    description:
      "Writes content to a file and then validates all Garden config files in one go, which is faster than using the write_file and garden_validate separately. Takes the same inputs as write_file.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The file contents to write",
        },
        file_path: {
          type: "string",
          description: "The path where the file should be written",
        },
        force: {
          type: "boolean",
          description: "If true, skip the overwrite confirmation prompt and write the file directly.",
        },
      },
      required: ["content", "file_path"],
    },
  },
] as Array<ToolUnion>

interface ReadFilesToolInput {
  file_paths: string[]
}

interface WriteFileToolInput {
  file_path: string
  content: string
  force?: boolean
}

interface ToolParams {
  rootDir: string
  log: Log
  input: unknown // Changed from object to unknown to match tool.input type
}

interface ToolResponse {
  content: string
  result: "success" | "error_continue" | "error_stop"
}

type ToolHandler = (params: ToolParams) => Promise<ToolResponse>

async function confirmOverwrite(filePath: string): Promise<boolean> {
  const rl = readline.createInterface({ input: inputRL, output: outputRL })
  const answer = await rl.question(chalk.yellow(`File "${filePath}" already exists. Overwrite? (y/N) `))
  rl.close()
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes"
}

const toolMap: Record<string, ToolHandler> = {
  get_repo_file_tree: async ({ rootDir, log }) => {
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

    log.info(chalk.cyan(`Scanning directory at ${rootDir}`))

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

    return { content: files.join("\n"), result: "success" }
  },

  read_files: async ({ rootDir, input, log }: ToolParams) => {
    const { file_paths: relativeFilePaths } = input as ReadFilesToolInput
    if (!Array.isArray(relativeFilePaths) || relativeFilePaths.some((p) => typeof p !== "string")) {
      const err = "Input 'file_paths' must be an array of strings."
      log.error(err)
      return { content: err, result: "error_stop" }
    }
    log.info(chalk.cyan(`Reading files at paths: ${relativeFilePaths.join(", ")}`))

    const results = await Promise.allSettled(
      relativeFilePaths.map(async (relativeFilePath) => {
        const absoluteFilePath = join(rootDir, relativeFilePath)
        try {
          const content = (await fsExtra.readFile(absoluteFilePath)).toString()
          log.info(chalk.green(`Successfully read file: ${absoluteFilePath}`))
          return { filePath: relativeFilePath, content }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          log.error(`Failed to read file at path: ${absoluteFilePath}: ${errorMessage}`)
          return { filePath: relativeFilePath, error: errorMessage }
        }
      })
    )

    const output = results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value
      } else {
        const reason = result.reason
        const errorMessage = reason instanceof Error ? reason.message : String(reason)
        log.error(`Unexpected error during file processing: ${errorMessage}`)
        return { filePath: "unknown_path_due_to_processing_error", error: errorMessage }
      }
    })

    return { content: JSON.stringify(output, null, 2), result: "success" }
  },

  write_file: async ({ rootDir, input, log }: ToolParams) => {
    const { file_path: relativeFilePath, content, force } = input as WriteFileToolInput
    const absoluteFilePath = join(rootDir, relativeFilePath)

    log.debug(`Writing file ${absoluteFilePath}`)

    let operationType = "created"

    const fileExists = await fsExtra.pathExists(absoluteFilePath)
    if (fileExists) {
      if (force) {
        log.info(chalk.cyan(`Overwriting file: ${absoluteFilePath}`))
        operationType = "overwrote"
      } else {
        log.info(chalk.yellow(`File "${absoluteFilePath}" already exists.`))
        const shouldOverwrite = await confirmOverwrite(absoluteFilePath)
        if (!shouldOverwrite) {
          const message = `Write operation cancelled: File "${absoluteFilePath}" exists and overwrite was declined.`
          return { content: message, result: "error_stop" }
        }
        log.info(chalk.cyan(`Overwriting "${absoluteFilePath}".`))
        operationType = "overwrote"
      }
    } else {
      log.info(chalk.cyan(`Creating file "${absoluteFilePath}".`))
    }

    await fsExtra.outputFile(absoluteFilePath, content)
    const successMessage = `Successfully ${operationType} file "${absoluteFilePath}"`
    return { content: successMessage, result: "success" }
  },

  garden_validate: async ({ rootDir, log }: ToolParams) => {
    log.info(chalk.cyan("Running 'garden validate'"))

    const validateCommand = new ValidateCommand()

    try {
      const garden = await Garden.factory(rootDir, {
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
          "root": rootDir,
          "env": "default",
          "force-refresh": true,
          "var": [],
        },
      })
      log.success("Successfully validated config")
      return { content: "OK", result: "success" }
    } catch (error) {
      let errorMessage = "'garden validate' failed with error"

      // TODO: detect non-recoverable errors
      if (error instanceof Error) {
        errorMessage += `:\n${error.toString()}`
      } else {
        errorMessage += `:\n${error}`
      }

      log.warn(chalk.yellow(errorMessage))

      return { content: stripAnsi(errorMessage), result: "error_continue" }
    }
  },

  write_file_and_validate: async ({ rootDir, input, log }: ToolParams): Promise<ToolResponse> => {
    const writeFileHandler = toolMap.write_file
    const validateHandler = toolMap.garden_validate

    // Call write_file logic
    const writeFileResult = await writeFileHandler({ rootDir, log, input })

    if (writeFileResult.result !== "success") {
      return writeFileResult // Return early if write_file failed
    }

    log.info(chalk.cyan("File written successfully, proceeding to validation."))

    // Call garden_validate logic
    // garden_validate's input schema is empty, so we pass an empty object for its specific input part.
    const validateResult = await validateHandler({ rootDir, log, input: {} })

    return validateResult // Return the result from validateHandler directly
  },
}

async function gardenBot(rootDir: string, log: Log) {
  const messages: MessageParam[] = [{ role: "user", content: initPrompt }]

  let loop = true

  while (loop) {
    const response = await promptClaude(log, messages)

    log.debug(`Got response from Claude: ${JSON.stringify(response)}`)

    messages.push({ role: "assistant", content: response.content })

    // TODO: support parallel tool use
    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((c) => c.type === "tool_use") as ToolUseBlock[]
      const tool = toolUses[toolUses.length - 1]
      const toolHandler = toolMap[tool.name]
      if (!toolHandler) {
        throw new Error(`Tool ${tool.name} not found in tool map`)
      }

      log.debug(`Executing tool ${tool.name} with params ${JSON.stringify(tool.input)}`)

      try {
        const toolResult = await toolHandler({
          rootDir,
          log: log.createLog({ origin: chalk.cyan(tool.name) }),
          input: tool.input,
        })

        log.debug(`Tool ${tool.name} executed with result ${JSON.stringify(toolResult)}`)

        if (toolResult.result === "error_stop") {
          log.error(toolResult.content)
          return
        }

        const toolUseMessage: ToolResultBlockParam = {
          tool_use_id: tool.id,
          content: toolResult.content,
          type: "tool_result",
        }

        messages.push({ role: "user", content: [toolUseMessage] })
      } catch (error) {
        log.error(`Unexpected error executing tool ${tool.name}: ${error}`)
        return
      }
    } else if (response.stop_reason === "pause_turn") {
      log.info(chalk.yellow("Waiting..."))
    } else {
      if (response.stop_reason === "max_tokens") {
        log.error(chalk.red("Max generated tokens reached, unable to continue :("))
      }
      loop = false
    }
  }

  log.success(
    `All done. Please review the created files carefully. Note that the results may not be perfect, but hopefully this helps you get started.\n\nDon't hesitate to ask for help in our Discord community if you get stuck!`
  )
}

async function promptClaude(log: Log, messages: MessageParam[]) {
  log.debug(chalk.cyan("[PROMPT]"))
  log.debug(chalk.cyan(JSON.stringify(messages[messages.length - 1], null, 4)) + "\n")

  let gotText = false

  const stream = anthropic.messages
    .stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 64000,
      system: "You are a Garden support engineer, Garden is a dev tool for Kubernetes",
      tools,
      messages,
    })
    .on("text", (text) => {
      if (!gotText) {
        process.stdout.write("\n")
      }
      gotText = true
      process.stdout.write(text)
    })

  const message = await stream.finalMessage()

  if (gotText) {
    process.stdout.write("\n\n")
  }

  return message
}
