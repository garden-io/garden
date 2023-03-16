/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { terraform } from "./cli"
import { TerraformProvider } from "."
import { ConfigurationError, ParameterError, RuntimeError } from "@garden-io/sdk/exceptions"
import { prepareVariables, setWorkspace, tfValidate } from "./common"
import { GardenModule, LogEntry, PluginCommand, PluginCommandParams, PluginContext } from "@garden-io/sdk/types"
import { TerraformModule } from "./module"
import { join } from "path"
import { remove } from "fs-extra"
import pRetry = require("p-retry")
import { getProviderStatusCachePath } from "@garden-io/core/build/src/tasks/resolve-provider"
import { findByName } from "@garden-io/core/build/src/util/util"

const commandsToWrap = ["apply", "plan", "destroy"]
const initCommand = chalk.bold("terraform init")

export const getTerraformCommands = (): PluginCommand[] =>
  commandsToWrap.flatMap((commandName) => [makeRootCommand(commandName), makeModuleCommand(commandName)])

function makeRootCommand(commandName: string) {
  const terraformCommand = chalk.bold("terraform " + commandName)

  return {
    name: commandName + "-root",
    description: `Runs ${terraformCommand} for the provider root stack, with the provider variables automatically configured as inputs. Positional arguments are passed to the command. If necessary, ${initCommand} is run first.`,
    title: chalk.bold.magenta(`Running ${chalk.white.bold(terraformCommand)} for project root stack`),
    async handler({ ctx, args, log }: PluginCommandParams) {
      const provider = ctx.provider as TerraformProvider

      if (!provider.config.initRoot) {
        throw new ConfigurationError(`terraform provider does not have an ${chalk.underline("initRoot")} configured`, {
          config: provider.config,
        })
      }

      // Clear the provider status cache, to avoid any user confusion
      const cachePath = getProviderStatusCachePath({
        gardenDirPath: ctx.gardenDirPath,
        pluginName: provider.name,
      })
      await remove(cachePath)

      const root = join(ctx.projectRoot, provider.config.initRoot)
      const workspace = provider.config.workspace || null

      await setWorkspace({ ctx, provider, root, log, workspace })
      await tfValidate({ ctx, provider, root, log })

      args = [commandName, ...(await prepareVariables(root, provider.config.variables)), ...args]

      await retryTerraform({ ctx, provider, log, args, root })

      return { result: {} }
    },
  }
}

function makeModuleCommand(commandName: string) {
  const terraformCommand = chalk.bold("terraform " + commandName)

  return {
    name: commandName + "-module",
    description: `Runs ${terraformCommand} for the specified module, with the module variables automatically configured as inputs. Use the module name as first argument, followed by any arguments you want to pass to the command. If necessary, ${initCommand} is run first.`,
    resolveModules: true,

    title: ({ args }) =>
      chalk.bold.magenta(`Running ${chalk.white.bold(terraformCommand)} for module ${chalk.white.bold(args[0] || "")}`),

    async handler({ ctx, args, log, modules }) {
      const module = findModule(modules, args[0])

      const root = join(module.path, module.spec.root)

      const provider = ctx.provider as TerraformProvider
      const workspace = module.spec.workspace || null

      await setWorkspace({ ctx, provider, root, log, workspace })
      await tfValidate({ ctx, provider, root, log })

      args = [commandName, ...(await prepareVariables(root, module.spec.variables)), ...args.slice(1)]
      await retryTerraform({ ctx, provider, log, args, root })

      return { result: {} }
    },
  }
}

// Regexes from Terragrunt, Copyright (c) 2016 Gruntwork, LLC, MIT Licensed
// https://github.com/gruntwork-io/terragrunt/blob/68120e20/LICENSE.txt
// https://github.com/gruntwork-io/terragrunt/blob/68120e20/options/auto_retry_options.go
const retryRegexes = [
  /(?s).*Failed to load state.*tcp.*timeout.*/,
  /(?s).*Failed to load backend.*TLS handshake timeout.*/,
  /(?s).*Creating metric alarm failed.*request to update this alarm is in progress.*/,
  /(?s).*Error installing provider.*TLS handshake timeout.*/,
  /(?s).*Error configuring the backend.*TLS handshake timeout.*/,
  /(?s).*Error installing provider.*tcp.*timeout.*/,
  /(?s).*Error installing provider.*tcp.*connection reset by peer.*/,
  /NoSuchBucket: The specified bucket does not exist/,
  /(?s).*Error creating SSM parameter: TooManyUpdates:.*/,
  /(?s).*app.terraform.io.*: 429 Too Many Requests.*/,
  /(?s).*ssh_exchange_identification.*Connection closed by remote host.*/,
  /(?s).*Client\\.Timeout exceeded while awaiting headers.*/,
  /(?s).*Could not download module.*The requested URL returned error: 429.*/,
]

function retryTerraform({
  ctx,
  provider,
  log,
  args,
  root,
}: {
  ctx: PluginContext
  provider: TerraformProvider
  log: LogEntry
  args: string[]
  root: string
}) {
  return pRetry(
    () =>
      terraform(ctx, provider).spawnAndWait({
        log,
        args,
        cwd: root,
        rawMode: false,
        tty: true,
        timeoutSec: 999999,
      }),
    {
      retries: 3,
      minTimeout: 1000,
      onFailedAttempt: (error) => {
        if (error.cause instanceof RuntimeError) {
          const stderr = error.cause.detail?.result?.stderr || ""
          const stdout = error.cause.detail?.result?.stdout || ""
          const matchedRegexes = retryRegexes.filter((regex) => regex.test(stderr) || regex.test(stdout))
          if (matchedRegexes.length) {
            log.warn(
              `Terraform failed with a recoverable error message (Matched regex ${matchedRegexes[0]}). Retrying after backoff... (${error.retriesLeft} retries left)`
            )
            return
          }
        }

        throw error.cause
      },
    }
  )
}

function findModule(modules: GardenModule[], name: string): TerraformModule {
  if (!name) {
    throw new ParameterError(`The first command argument must be a module name.`, { name })
  }

  const module = findByName(modules, name)

  if (!module) {
    throw new ParameterError(chalk.red(`Could not find module ${chalk.white(name)}.`), {})
  }

  if (!module.compatibleTypes.includes("terraform")) {
    throw new ParameterError(chalk.red(`Module ${chalk.white(name)} is not a terraform module.`), {
      name,
      type: module.type,
      compatibleTypes: module.compatibleTypes,
    })
  }

  return module
}
