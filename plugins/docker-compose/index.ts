/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sdk } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/util/string"

import {
  providerSchema,
  dockerComposeServiceBuildSchema,
  dockerComposeServiceDeploySchema,
  providerOutputsSchema,
  dockerComposeExecSchema,
  dockerComposeRunSchema,
  dockerRunSchema,
  dockerComposeRunSchemaBase,
} from "./schemas"
import { dockerComposeSpec, compose, dockerSpec, docker } from "./tools"
import Bluebird from "bluebird"
import { flatten, fromPairs, isArray } from "lodash"
import { getCommonArgs, getComposeConfig, getComposeContainers, getIngresses, getNetworkNamesFromConfig, getProjectInfo, getProjects, qualifiedNetworkName, runToolWithArgs, withLockOnNetworkCreation } from "./common"
import { ActionState, actionReferenceToString } from "@garden-io/core/build/src/actions/types"
import { DeployState } from "@garden-io/core/build/src/types/service"
import { LogLevel } from "@garden-io/sdk/types"

const s = sdk.schema

export const gardenPlugin = sdk.createGardenPlugin({
  name: "docker-compose",
  docs: dedent`TODO`,
})

gardenPlugin.addTool(dockerComposeSpec)
gardenPlugin.addTool(dockerSpec)

const composeProvider = gardenPlugin.createProvider({
  configSchema: providerSchema,
  outputsSchema: providerOutputsSchema,
})

export type DockerComposeProvider = typeof composeProvider.T.Provider
export type DockerComposeProviderConfig = typeof composeProvider.T.Config

/**
 * Add compose plugin command
 */
composeProvider.addCommand({
  name: "compose",
  description: "Run the docker-compose CLI directly. All arguments are passed to the compose CLI.",
  handler: async ({ ctx, log, args, cwd }) => {
    const result = await compose(ctx).exec({
      log,
      args,
      ignoreError: true,
      cwd: cwd || process.cwd(),
      streamLogs: {
        ctx,
        logLevel: sdk.LogLevel.info,
        print: true,
      },
    })

    return {
      result,
      exitCode: result.exitCode,
    }
  },
})

/**
 * Suggest compose-specific commands to run
 */
composeProvider.addHandler("suggestCommands", async ({ ctx, log }) => {
  const tool = ctx.tools["docker-compose.docker-compose"]
  const composePath = await tool.ensurePath(log)

  return {
    commands: getProjects(ctx).flatMap((p) => {
      const name = p.name ? `compose up (${p.name})` : "compose up"

      return [
        {
          name,
          description: "Run 'docker compose up' directly, spinning up your stack.",
          icon: {
            name: "docker",
          },
          shellCommand: {
            command: composePath,
            args: ["up"],
            cwd: p.cwd,
          },
        },
      ]
    }),
  }
})

// composeProvider.addHandler("getEnvironmentStatus", async ({ ctx }) => {
//   // TODO: Check if all networks exist
//   console.log("bar")
//   return { ready: false, outputs: {} }
// })

// /**
//  * Ensure the networks listed in the docker-compose project exist (to prevent race conditions when deploying).
//  */
// composeProvider.addHandler("prepareEnvironment", async ({ ctx, log }) => {
//   await Bluebird.map(getProjects(ctx), async (projectSpec) => {
//     const path = projectSpec.cwd
//     const config = await getComposeConfig(ctx, log, projectSpec)
//     console.log("here")
//   })
//   console.log("foo")
//   return { status: { ready: true, outputs: {} } }
// })

/**
 * Convert docker-compose projects to individual service Build and Deploy actions
 */
// Note: We may want to introduce a "meta" action instead that's converted into more granular services but that
//       will need more frameworking, so we define the compose config paths in the provider config atm and
//       the provider generates these actions for each project.
composeProvider.addHandler("augmentGraph", async ({ ctx, log, actions }) => {
  const existingActionKeys = actions.filter((a) => !a.isDisabled()).map((a) => a.key())

  const generated = flatten(
    await Bluebird.map(getProjects(ctx), async (projectSpec) => {
      const path = projectSpec.cwd
      const config = await getComposeConfig(ctx, log, projectSpec)

      const services = config.services || {}
      const description = `Compose stack at '${projectSpec.path}'`

      const getActionName = (serviceName: string) =>
        projectSpec.name ? `${projectSpec.name}-${serviceName}` : serviceName

      return Object.entries(services).flatMap(([serviceName, serviceSpec]) => {
        const name = getActionName(serviceName)

        let dependsOn = (<any>serviceSpec).depends_on || {}

        if (isArray(dependsOn)) {
          dependsOn = fromPairs(dependsOn.map((d) => [d, { condition: "service_started" }]))
        }

        // TODO: support the different types of conditions,
        // see https://docs.docker.com/compose/compose-file/05-services/#depends_on
        // Currently the condition is effectively always "service_healthy".
        // (needs a bit of frameworking to address)
        const dependencies = Object.keys(dependsOn).map((d) => ({ kind: "Deploy" as const, name: getActionName(d) }))

        const projectName = projectSpec.name || undefined

        return [
          // TODO: maybe we can skip the build if just referencing a remote image
          {
            kind: "Build" as const,
            type: "docker-compose-service",
            name,
            description: `Build service '${name}' in ${description} (auto-generated)`,
            internal: {
              basePath: path,
            },
            timeout: 86400, // TODO: allow configuration on this (compose doesn't have that feature itself)
            spec: {
              projectName,
              service: serviceName,
            },
          },
          {
            kind: "Deploy" as const,
            type: "docker-compose-service",
            name,
            description: `Deploy service '${name}' in ${description} (auto-generated)`,
            internal: {
              basePath: path,
            },
            build: name,
            dependencies,
            timeout: 86400, // TODO: allow configuration on this (compose doesn't have that feature itself)
            spec: {
              projectName,
              service: serviceName,
            },
          },
        ]
      })
    })
  )

  return {
    // Allow users to specify their own action to override the default generated ones
    addActions: generated.filter((c) => !existingActionKeys.includes(actionReferenceToString(c))),
  }
})

/**
 * BUILD
 */
const composeBuild = composeProvider.createActionType({
  kind: "Build",
  name: "docker-compose-service",
  docs: "TODO",
  specSchema: dockerComposeServiceBuildSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

composeBuild.addHandler("build", async ({ ctx, log, action }) => {
  const spec = action.getSpec()

  const args = [...getCommonArgs(spec), "build", "--progress=plain", spec.service]

  const result = await compose(ctx).exec({
    cwd: action.basePath(),
    args,
    log,
    timeoutSec: action.getConfig().timeout,
    streamLogs: { ctx },
  })

  return {
    state: "ready",
    detail: {
      buildLog: result.all || result.stdout || result.stderr || "",
      details: {},
    },
    outputs: {},
  }
})

/**
 * DEPLOY
 */
const composeDeploy = composeProvider.createActionType({
  kind: "Deploy",
  name: "docker-compose-service",
  docs: "TODO",
  specSchema: dockerComposeServiceDeploySchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

composeDeploy.addHandler("deploy", async ({ ctx, log, action, force }) => {
  const spec = action.getSpec()

  const args = [
    ...getCommonArgs(spec),
    "up",
    "--no-log-prefix",
    "--no-deps",
    "--wait",
    "--wait-timeout=" + action.getConfig().timeout,
    spec.service,
  ]

  if (force) {
    args.push("--force-recreate")
  }

  const path = action.basePath()

  const config = await getComposeConfig(ctx, log, getProjectInfo(spec.projectName, path))
  const qualifiedNetworkNames = getNetworkNamesFromConfig(config, spec.service)

  await withLockOnNetworkCreation(
    () => compose(ctx).exec({
      cwd: action.basePath(),
      args,
      log,
      streamLogs: { ctx },
    }),
    {
      log,
      qualifiedNetworkNames,
      serviceName: spec.service,
    }
  )

  const portSpecs = config?.services?.[spec.service]?.ports || []
  const ingresses = getIngresses(portSpecs)

  return {
    state: "ready",
    detail: {
      detail: {},
      state: "ready",
      ingresses,
    },
    outputs: {},
  }
})

composeDeploy.addHandler("getStatus", async ({ ctx, log, action }) => {
  const path = action.basePath()
  const spec = action.getSpec()
  const running = await getComposeContainers(ctx, log, getProjectInfo(spec.projectName, path))
  // Our generated Compose Deploys have the same name as the services in the Compose project.
  const runningForDeploy = running.find((r) => r.Service === action.name)
  const state: ActionState = runningForDeploy && runningForDeploy.State === "running" ? "ready" : "not-ready"
  const deployState: DeployState = state === "ready" ? "ready" : "missing"
  const config = await getComposeConfig(ctx, log, getProjectInfo(spec.projectName, path))
  const portSpecs = config?.services?.[spec.service]?.ports || []
  const ingresses = getIngresses(portSpecs)
  return {
    state,
    detail: {
      detail: {},
      state: deployState,
      ingresses,
    },
    outputs: {},
  }
})

composeDeploy.addHandler("delete", async ({ ctx, log, action }) => {
  const spec = action.getSpec()

  // The `stop` command seems to only work for the whole compose project at once, so we use `rm` instead
  const args = [...getCommonArgs(spec), "rm", "--force", "--stop", spec.service]

  await compose(ctx).exec({
    cwd: action.basePath(),
    args,
    log,
    timeoutSec: action.getConfig().timeout,
    streamLogs: { ctx },
  })

  return {
    state: "not-ready",
    detail: {
      detail: {},
      state: "missing",
    },
    outputs: {},
  }
})

composeDeploy.addHandler("getLogs", async ({ ctx, log, action, since, follow, tail }) => {
  const spec = action.getSpec()

  const args = [...getCommonArgs(spec), "logs", spec.service]

  // TODO: we should validate the user duration input
  since && args.push("--since", since)
  tail && args.push("--tail", tail.toString())
  follow && args.push("--follow")

  await compose(ctx).exec({
    cwd: action.basePath(),
    args,
    log,
    streamLogs: { ctx, print: true, emitEvent: false, logLevel: LogLevel.info }
  })

  return {}
})

/**
 * EXEC
 */
const makeComposeExecHandler = () => {
  return async ({ ctx, log, action }) => {
    const spec = action.getSpec()

    const args = ["exec", spec.service, ...spec.command || []]

    // TODO: add env var flags

    const opts: string[] = []

    // if (spec.index) {
    //   opts.push("--index", spec.index.toString())
    // }
    if (spec.privileged) {
      opts.push("--privileged")
    }
    if (spec.user) {
      opts.push("--user", spec.user)
    }
    if (spec.workdir) {
      opts.push("--workdir", spec.workdir)
    }

    const {
      state,
      success,
      startedAt,
      completedAt,
      output,
    } = await runToolWithArgs(compose(ctx), {
      cwd: action.basePath(),
      args: [...opts, ...args],
      log,
      streamLogs: { ctx },
    })

    return {
      state,
      detail: {
        success,
        startedAt,
        completedAt,
        log: output,
      },
      outputs: {}, // TODO
    }
  }
}

const composeExecRun = composeProvider.createActionType({
  kind: "Run",
  name: "docker-compose-exec",
  docs: "Uses \`docker compose exec\` to execute the specified command in an already running \`docker-compose\` service.",
  specSchema: dockerComposeExecSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})


composeExecRun.addHandler("run", makeComposeExecHandler())

const composeExecTest = composeProvider.createActionType({
  kind: "Test",
  name: "docker-compose-exec",
  docs: "Runs a test suite by using \`docker compose exec\` to execute the specified command in an already running \`docker-compose\` service.",
  specSchema: dockerComposeExecSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

composeExecTest.addHandler("run", makeComposeExecHandler())

/**
 * DOCKER FRESH / RUN
 * (Runs and Tests)
 */

function getRunOpts(spec: sdk.types.infer<typeof dockerComposeRunSchemaBase>) {
  const opts: string[] = []

  if (spec.name) {
    opts.push("--name", spec.name)
  }
  if (spec.rm) {
    opts.push("--rm")
  }
  if (spec.servicePorts) {
    opts.push("--service-ports")
  }
  if (spec.useAliases) {
    opts.push("--use-aliases")
  }
  for (const v of spec.volumes) {
    opts.push("--volume", v)
  }
  for (const qualified of spec.networks.map((n) => qualifiedNetworkName(spec.projectName, n))) {
    opts.push("--network", qualified)
  }
  if (spec.user) {
    opts.push("--user", spec.user)
  }
  if (spec.workdir) {
    opts.push("--workdir", spec.workdir)
  }

  return opts
}

// We use the word "fresh" instead of "run" to distinguish from "exec" (as in, run in a fresh container instead of
// inside a running service. Just internally to the plugin, to avoid mind-numbingly inane names like `dockerRunRun` and
// `dockerComposeRunRun`.

const makeDockerFreshHandler = () => {
  return async ({ ctx, log, action }) => {
    const spec = action.getSpec()

    const opts = [
      "run",
      // "--build", // TODO: consider making this configurable?
      ...spec.command || [],
      ...getRunOpts(spec),
    ]

    // TODO: add env var flags
    // TODO: support interactive flag

    const {
      state,
      success,
      startedAt,
      completedAt,
      output,
    } = await runToolWithArgs(docker(ctx), {
      cwd: action.basePath(),
      args: [...opts, spec.image],
      log,
      streamLogs: { ctx },
    })

    return {
      state,
      detail: {
        success,
        startedAt,
        completedAt,
        log: output,
      },
      outputs: {}, // TODO
    }
  }
}

const dockerFreshRun = composeProvider.createActionType({
  kind: "Run",
  name: "docker-run",
  docs: "Uses \`docker run\` to execute the specified command in a new, one-off container from the specified image.",
  specSchema: dockerRunSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

dockerFreshRun.addHandler("run", makeDockerFreshHandler())

const dockerFreshTest = composeProvider.createActionType({
  kind: "Test",
  name: "docker-run",
  docs: "Runs a test suite by using \`docker run\` to execute the specified command in a new, one-off container from the specified image.",
  specSchema: dockerRunSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

dockerFreshTest.addHandler("run", makeDockerFreshHandler())

/**
 * DOCKER COMPOSE FRESH / RUN
 * (Runs and Tests)
 */

const makeDockerComposeFreshHandler = () => {
  return async ({ ctx, log, action }) => {
    const spec = action.getSpec()

    const opts = [
      "run",
      // "--build", // TODO: consider making this configurable?
      ...spec.command || [],
      ...getRunOpts(spec),
    ]

    // TODO: add env var flags
    // TODO: support interactive flag
    const {
      state,
      success,
      startedAt,
      completedAt,
      output,
    } = await runToolWithArgs(compose(ctx), {
      cwd: action.basePath(),
      args: [...opts, spec.service],
      log,
      streamLogs: { ctx },
    })

    return {
      state,
      detail: {
        success,
        startedAt,
        completedAt,
        log: output,
      },
      outputs: {}, // TODO
    }
  }
}

const dockerComposeFreshRun = composeProvider.createActionType({
  kind: "Run",
  name: "docker-compose-run",
  docs: "Uses \` compose run\` to execute the specified command in a new, one-off container from the specified Compose service.",
  specSchema: dockerComposeRunSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

dockerComposeFreshRun.addHandler("run", makeDockerComposeFreshHandler())

const dockerComposeFreshTest = composeProvider.createActionType({
  kind: "Test",
  name: "docker-compose-run",
  docs: "Runs a test suite by using \` compose run\` to execute the specified command in a new, one-off container from the specified Compose service.",
  specSchema: dockerComposeRunSchema,
  staticOutputsSchema: s.object({}), // TODO
  runtimeOutputsSchema: s.object({}), // TODO
})

dockerComposeFreshTest.addHandler("run", makeDockerComposeFreshHandler())

