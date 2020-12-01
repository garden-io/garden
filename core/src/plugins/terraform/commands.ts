/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { terraform } from "./cli"
import { TerraformProvider } from "./terraform"
import { ConfigurationError, ParameterError } from "../../exceptions"
import { prepareVariables, tfValidate, setWorkspace } from "./common"
import { GardenModule } from "../../types/module"
import { findByName } from "../../util/util"
import { TerraformModule } from "./module"
import { PluginCommand, PluginCommandParams } from "../../types/plugin/command"
import { join } from "path"
import { remove } from "fs-extra"
import { getProviderStatusCachePath } from "../../tasks/resolve-provider"

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
        environmentName: ctx.environmentName,
      })
      await remove(cachePath)

      const root = join(ctx.projectRoot, provider.config.initRoot)
      const workspace = provider.config.workspace || null

      await setWorkspace({ ctx, provider, root, log, workspace })
      await tfValidate({ ctx, provider, root, log })

      args = [commandName, ...(await prepareVariables(root, provider.config.variables)), ...args]

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
