/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { terraform } from "./cli.js"
import type { TerraformProvider } from "./provider.js"
import { ConfigurationError, ParameterError } from "@garden-io/sdk/build/src/exceptions.js"
import { prepareVariables, ensureWorkspace, ensureTerraformInit } from "./helpers.js"
import type { ConfigGraph, PluginCommand, PluginCommandParams } from "@garden-io/sdk/build/src/types.js"
import { join } from "path"
import fsExtra from "fs-extra"
const { remove } = fsExtra
import { getProviderStatusCachePath } from "@garden-io/core/build/src/tasks/resolve-provider.js"
import type { TerraformDeploy } from "./action.js"
import { styles } from "@garden-io/core/build/src/logger/styles.js"

const commandsToWrap = [
  "apply",
  "plan",
  "destroy",
  "init",
  "validate",
  "output",
  "show",
  "refresh",
  "force-unlock",
  "fmt",
  "get",
  "graph",
  "import",
  "login",
  "logout",
  "taint",
  "test",
  "untaint",
  "metadata-functions",
  "workspace-functions",
  "state-list",
  "state-mv",
  "state-pull",
  "state-push",
  "state-replace-provider",
  "state-rm",
  "state-show",
]

// Commands that accept -var parameters
const commandsAcceptingVars = new Set(["apply", "plan", "destroy", "refresh", "import"])

// Commands that require terraform init to be run first
const commandsRequiringInit = new Set([
  "apply",
  "plan",
  "destroy",
  "refresh",
  "import",
  "output",
  "show",
  "graph",
  "taint",
  "untaint",
  "test",
  "force-unlock",
  "workspace-functions",
  "state-list",
  "state-mv",
  "state-pull",
  "state-push",
  "state-replace-provider",
  "state-rm",
  "state-show",
])

// Commands that require workspace selection
const commandsRequiringWorkspace = new Set([
  "apply",
  "plan",
  "destroy",
  "refresh",
  "import",
  "output",
  "show",
  "graph",
  "taint",
  "untaint",
  "test",
  "workspace-functions",
  "state-list",
  "state-mv",
  "state-pull",
  "state-push",
  "state-replace-provider",
  "state-rm",
  "state-show",
])

const initCommand = styles.bold("terraform init")

export const getTerraformCommands = (): PluginCommand[] => {
  const commands = commandsToWrap.flatMap((commandName) => [
    makeRootCommand(commandName),
    makeActionCommand(commandName),
  ])
  return commands
}

function makeRootCommand(commandName: string): PluginCommand {
  const commandNameArgs = getCommandNameArgs(commandName)
  const terraformCommand = styles.bold("terraform " + commandNameArgs.join(" "))

  return {
    name: commandName + "-root",
    description: `Runs ${terraformCommand} for the provider root stack, with the provider variables automatically configured as inputs. Positional arguments are passed to the command. If necessary and appropriate, ${initCommand} may be run first.`,
    title: styles.command(`Running ${styles.command(terraformCommand)} for project root stack`),
    async handler({ ctx, args, log }: PluginCommandParams) {
      const provider = ctx.provider as TerraformProvider

      if (!provider.config.initRoot) {
        throw new ConfigurationError({
          message: `terraform provider does not have an ${styles.underline(
            "initRoot"
          )} configured in the provider section of the project configuration`,
        })
      }

      // Clear the provider status cache, to avoid any user confusion
      const cachePath = getProviderStatusCachePath({
        gardenDirPath: ctx.gardenDirPath,
        pluginName: provider.name,
      })
      await remove(cachePath)

      // Use provider config
      const root = join(ctx.projectRoot, provider.config.initRoot)
      const workspace = provider.config.workspace || null
      const backendConfig = provider.config.backendConfig

      // Only run workspace and init setup for commands that need them
      if (commandsRequiringWorkspace.has(commandName)) {
        await ensureWorkspace({ ctx, provider, root, log, workspace })
      }
      if (commandsRequiringInit.has(commandName)) {
        await ensureTerraformInit({ ctx, provider, root, log, backendConfig })
      }

      // Only add -var parameters for commands that support them
      if (commandsAcceptingVars.has(commandName)) {
        args = [...commandNameArgs, ...(await prepareVariables(root, provider.config.variables)), ...args]
      } else {
        args = [...commandNameArgs, ...args]
      }

      await terraform(ctx, provider).spawnAndWait({
        log,
        args,
        cwd: root,
        rawMode: false,
        tty: true,
        timeoutSec: 999999,
      })

      return { result: {} }
    },
  }
}

function makeActionCommand(commandName: string): PluginCommand {
  const commandNameArgs = getCommandNameArgs(commandName)
  const terraformCommand = styles.bold("terraform " + commandNameArgs.join(" "))

  return {
    name: commandName + "-action",
    description: `Runs ${terraformCommand} for the specified terraform Deploy action, with variables automatically configured as inputs. Use the action name as first argument, followed by any arguments you want to pass to the command. If necessary, ${initCommand} is run first.`,
    resolveGraph: true,

    title: ({ args }) =>
      styles.command(
        `Running ${styles.command(terraformCommand)} for the Deploy action ${styles.accent.bold(args[0] || "")}`
      ),

    async handler({ garden, ctx, args, log, graph }) {
      const action = findAction(graph, args[0])

      const resolvedAction = await garden.resolveAction({ graph, action, log })
      const spec = resolvedAction.getSpec()

      const root = join(action.sourcePath(), spec.root)

      const provider = ctx.provider as TerraformProvider
      // Use action spec
      const workspace = spec.workspace || null
      const backendConfig = spec.backendConfig

      // Only run workspace and init setup for commands that need them
      if (commandsRequiringWorkspace.has(commandName)) {
        await ensureWorkspace({ ctx, provider, root, log, workspace })
      }
      if (commandsRequiringInit.has(commandName)) {
        await ensureTerraformInit({ ctx, provider, root, log, backendConfig })
      }

      // Only add -var parameters for commands that support them
      if (commandsAcceptingVars.has(commandName)) {
        args = [...commandNameArgs, ...(await prepareVariables(root, spec.variables)), ...args.slice(1)]
      } else {
        args = [...commandNameArgs, ...args.slice(1)]
      }

      await terraform(ctx, provider).spawnAndWait({
        log,
        args,
        cwd: root,
        rawMode: false,
        tty: true,
        timeoutSec: 999999,
      })

      return { result: {} }
    },
  }
}

function findAction(graph: ConfigGraph, name: string): TerraformDeploy {
  if (!name) {
    throw new ParameterError({ message: `The first command argument must be an action name.` })
  }

  const action = graph.getDeploy(name)

  if (!action.isCompatible("terraform")) {
    throw new ParameterError({
      message: styles.error(`Action ${styles.accent(name)} is not a terraform action (got ${action.type}).`),
    })
  }

  return action
}

function getCommandNameArgs(commandName: string): string[] {
  if (commandName.includes("-")) {
    return commandName.split("-")
  }
  return [commandName]
}
