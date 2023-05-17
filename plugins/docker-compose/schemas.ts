/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sdk } from "@garden-io/sdk"

const s = sdk.schema

const dockerComposeProjectSchema = s.object({
  name: s
    .identifier()
    .nullable()
    .default(null)
    .describe("The name of the project. You must specify this and make it unique if you have multiple projects."),
  path: s
    .posixPath()
    .describe("The path to the Compose project directory. Important: This must be within a git repository!"),
})

export type DockerComposeProjectSpec = sdk.types.infer<typeof dockerComposeProjectSchema>

export const providerSchema = s.object({
  projects: s
    .array(dockerComposeProjectSchema)
    .unique("name")
    .default([{ path: "." }])
    .describe("Specify Compose projects to import. Defaults to look for one in the project root."),
})

// TODO
export const providerOutputsSchema = s.object({})

export const dockerComposeDeploySchema = s.object({
  envFiles: s.array(s.string()).optional().describe("Paths to specific environment files instead of the default."),
  files: s.array(s.string()).optional().describe("List of paths to specific compose files instead of the default."),
  profiles: s.array(s.string()).optional().describe("Specify profiles to enable."),
  projectName: s.string().optional().describe("Set a project name."),
})

export type DockerComposeDeploySpec = sdk.types.infer<typeof dockerComposeDeploySchema>

const projectNameSchema = s
  .identifier()
  .optional()
  .describe("The Compose project name, as specified in the provider configuration.")

export const dockerComposeServiceBuildSchema = s.object({
  // TODO: build-args
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service to build."),
})

export const dockerComposeServiceDeploySchema = s.object({
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service to deploy."),
})

const commonRunKeys = s.object({
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service."),
  command: s.string().describe("The command to run."),
  arguments: s.array(s.string()).default([]).describe("Arguments to pass to the command."),
  env: s.envVars().default({}).describe("Environment variables to set during execution."),
  user: s.string().optional().describe("Run the command as this user."),
  workdir: s.string().optional().describe("Path to workdir directory for this command."),
  extraArgs: s.array(s.string()).default([]).describe("Extra arguments to pass to the command."),
})

export const dockerComposeExecSchema = commonRunKeys.extend({
  index: s.number().default(1).describe("Index of the container if there are multiple instances of a service."),
  privileged: s.boolean().default(false).describe("Give extended privileges to the process."),
})

// TODO: there are more options on `docker compose run` that we could support (but extraArgs does the job for now)
export const dockerComposeRunSchema = commonRunKeys.extend({
  name: s.string().optional().describe("Assign a name to the container."),
  servicePorts: s
    .boolean()
    .default(false)
    .describe("Run command with the service's ports enabled and mapped to the host."),
  // TODO: should we default to true here? (seems more rational in the context)
  rm: s.boolean().default(false).describe("Automatically remove the container when it exits."),
  useAliases: s
    .boolean()
    .default(false)
    .describe("Use the service's network useAliases in the network(s) the container connects to."),
  volumes: s.array(s.string()).default([]).describe("Bind mount one or more volumes."),
})
