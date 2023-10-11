/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ResolvedRunAction, RunActionConfig } from "@garden-io/core/build/src/actions/run"
import { ResolvedTestAction, TestActionConfig } from "@garden-io/core/src/actions/test"
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
  projectName: s.string().optional().describe(sdk.util.deline`
    The Compose project name. Defaults to the name of the Docker Compose project that the action config is nested inside.
  `),
})

export type DockerComposeDeploySpec = sdk.types.infer<typeof dockerComposeDeploySchema>

const projectNameSchema = s
  .string()
  .describe(
    "The Compose project name. This field is usually unnecessary unless using several Compose projects together."
  )
  .optional()

export type DockerComposeBuildSpec = sdk.types.infer<typeof dockerComposeServiceBuildSchema>

export const dockerComposeServiceBuildSchema = s.object({
  // TODO: build-args
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service to build."),
})

export const dockerComposeServiceDeploySchema = s.object({
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service to deploy."),
})

export type DockerComposeExecRunSpec = sdk.types.infer<typeof dockerComposeExecSchema>
export type DockerComposeFreshRunSpec = sdk.types.infer<typeof dockerComposeRunSchema>
export type DockerRunSpec = sdk.types.infer<typeof dockerRunSchema>

export type DockerComposeRunSpec =
  | sdk.types.infer<typeof dockerComposeExecSchema>
  | sdk.types.infer<typeof dockerComposeRunSchema>
  | sdk.types.infer<typeof dockerRunSchema>

export type DockerComposeTestSpec = DockerComposeRunSpec

// These are somewhat loose utility type for use in helpers that take an action as a param, to make sure we can
// typecheck the spec on the action that's passed.

export type ResolvedComposeRunAction = ResolvedRunAction<RunActionConfig<any, DockerComposeFreshRunSpec>>
export type ResolvedComposeTestAction = ResolvedTestAction<TestActionConfig<any, DockerComposeFreshRunSpec>>

export type ResolvedDockerRunAction = ResolvedRunAction<RunActionConfig<any, DockerRunSpec>>
export type ResolvedDockerTestAction = ResolvedTestAction<TestActionConfig<any, DockerRunSpec>>

// Shared by `docker-compose-exec`, `docker-run` and `docker-compose-run` actions.
const commonRunKeys = s.object({
  projectName: projectNameSchema,
  service: s.string().describe("The name of the service."),
  env: s.envVars().default({}).describe("Environment variables to set during execution."),
  user: s.string().optional().describe("Run the command as this user."),
  workdir: s.string().optional().describe("Path to workdir directory for this command."),
})

export const dockerComposeExecSchema = commonRunKeys.extend({
  // image: s.string().optional().describe("The name of the service."),
  command: s
    .array(s.string())
    .describe(
      sdk.util.dedent`
      The command to run inside the container. Note that there's no entrypoint on this schema: When we exec into
      a running container, there's no need to override the image's entrypoint.

      This field maps to the \`COMMAND\` that's passed to \`docker compose exec\`. See
      https://docs.docker.com/engine/reference/commandline/exec/#description for more info.
    `
    )
    .example(["echo", "Hello World"]),
  index: s.number().default(1).describe("Index of the container if there are multiple instances of a service."),
  privileged: s.boolean().default(false).describe("Give extended privileges to the process."),
})

// TODO: there are more options on `docker compose run` that we could support (but `command` does the job for now)
export const dockerComposeRunSchema = commonRunKeys.extend({
  entrypoint: s
    .string()
    .optional()
    .describe(
      `
      Override the image's entrypoint. See https://docs.docker.com/engine/reference/run/#entrypoint-default-command-to-execute-at-runtime for more details.
    `
    )
    .example(["/bin/sh"]),
  command: s
    .array(s.string())
    .optional()
    .describe(
      `
      The command that is executed in the container.

      Note: If you're also providing an \`entrypoint\`, any arguments it requires should be passed here.

      For example, if you wanted to run \`/bin/sh -c echo "Hello world!"\` in the container, you'd set
      \`/bin/sh\` as the \`entrypoint\`, and \`["-c", "echo", "Hello world!"]\` as the \`cmd\`.

      These fields map to the \`--entrypoint\` and \`--cmd\` CLI options for \`docker\` run and
      \`docker compose run\`.

      To learn more about how \`entrypoint\` and \`cmd\` work together in Docker, please check out the following pages:

      https://docs.docker.com/engine/reference/run/#cmd-default-command-or-options

      https://docs.docker.com/engine/reference/builder/#cmd
    `
    )
    .example(["npm", "run", "test"]),
  name: s.string().optional().describe("Assign a name to the container."),
  servicePorts: s
    .boolean()
    .default(false)
    .describe("Run command with the service's ports enabled and mapped to the host."),
  networks: s.array(s.string()).default([]).describe("Connect the container to these networks."),
  rm: s.boolean().default(true).describe("Automatically remove the container when it exits."),
  useAliases: s
    .boolean()
    .default(false)
    .describe("Use the service's network useAliases in the network(s) the container connects to."),
  volumes: s.array(s.string()).default([]).describe("Bind mount one or more volumes."),
})

export const dockerComposeRunSchemaBase = dockerComposeRunSchema.omit({ service: true })

// For running by passing an image id to the `docker` CLI (not by passing a service name to `docker compose`).
export const dockerRunSchema = dockerComposeRunSchemaBase.extend({
  image: s.string().describe("The image name for the container to run. Should be a valid Docker image identifier."),
})

export type DockerComposeActionSpec =
  | DockerComposeBuildSpec
  | DockerComposeDeploySpec
  | DockerComposeRunSpec
  | DockerComposeTestSpec
