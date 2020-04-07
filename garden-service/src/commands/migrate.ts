/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult, BooleanParameter, StringsParameter } from "./base"
import { safeDump } from "js-yaml"
import { dedent } from "../util/string"
import { readFile, writeFile } from "fs-extra"
import { cloneDeep, isEqual } from "lodash"
import { ConfigurationError, RuntimeError } from "../exceptions"
import { resolve, parse } from "path"
import { findConfigPathsInPath, getConfigFilePath } from "../util/fs"
import { GitHandler } from "../vcs/git"
import { DEFAULT_GARDEN_DIR_NAME } from "../constants"
import { exec } from "../util/util"
import { LoggerType } from "../logger/logger"
import Bluebird from "bluebird"
import { loadAndValidateYaml } from "../config/base"

const migrateOptions = {
  write: new BooleanParameter({ help: "Update the `garden.yml` in place." }),
}

const migrateArguments = {
  configPaths: new StringsParameter({
    help: "Specify the path to a `garden.yml` file to convert. Use comma as a separator to specify multiple files.",
  }),
}

type Args = typeof migrateArguments
type Opts = typeof migrateOptions

interface UpdatedConfig {
  path: string
  specs: any[]
}

export interface MigrateCommandResult {
  updatedConfigs: UpdatedConfig[]
}

export class MigrateCommand extends Command<Args, Opts> {
  name = "migrate"
  noProject = true
  arguments = migrateArguments
  options = migrateOptions
  help = "Migrate `garden.yml` configuration files to version v0.11.x"

  description = dedent`
    Scans the project for \`garden.yml\` configuration files and updates those that are not compatible with version v0.11.
    By default the command prints the updated versions to the terminal. You can optionally update the files in place with the \`write\` flag.

    Note: This command does not validate the configs per se. It will simply try to convert a given configuration file so that
    it is compatible with version v0.11 or greater, regardless of whether that file was ever a valid Garden config. It is therefore
    recommended that this is used on existing \`garden.yml\` files that were valid in version v0.10.x.

    Examples:

        garden migrate              # scans all garden.yml files and prints the updated versions along with the paths to them.
        garden migrate --write      # scans all garden.yml files and overwrites them with the updated versions.
        garden migrate ./garden.yml # scans the provided garden.yml file and prints the updated version.

  `

  getLoggerType(): LoggerType {
    return "basic"
  }

  async action({ log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<MigrateCommandResult>> {
    // opts.root defaults to current directory
    const root = await findRoot(opts.root)
    if (!root) {
      throw new ConfigurationError(`Not a project directory (or any of the parent directories): ${opts.root}`, {
        root: opts.root,
      })
    }

    const updatedConfigs: { path: string; specs: any[] }[] = []

    let configPaths: string[] = []
    if (args.configPaths && args.configPaths.length > 0) {
      configPaths = args.configPaths.map((path) => resolve(root, path))
    } else {
      const vcs = new GitHandler(resolve(root, DEFAULT_GARDEN_DIR_NAME), [])
      configPaths = await findConfigPathsInPath({
        dir: root,
        vcs,
        log,
      })
    }

    // Iterate over configs and update specs if needed
    for (const configPath of configPaths) {
      const specs = await readYaml(configPath)
      const updatedSpecs = specs.map((spec) =>
        [spec]
          .map((s) => applyFlatStyle(s))
          .map((s) => removeLocalOpenFaas(s))
          .map((s) => removeEnvironmentDefaults(s, configPath))
          .pop()
      )

      // Nothing to do
      if (isEqual(specs, updatedSpecs)) {
        continue
      }

      updatedConfigs.push({
        path: configPath,
        specs: updatedSpecs,
      })
    }

    // Throw if any config files have been modified so that user changes don't get overwritten
    if (opts.write) {
      const dirtyConfigs = await Bluebird.map(updatedConfigs, async ({ path }) => {
        const modified = !!(
          await exec("git", ["ls-files", "-m", "--others", "--exclude-standard", path], { cwd: root })
        ).stdout
        if (modified) {
          return path
        }
        return null
      }).filter(Boolean)
      if (dirtyConfigs.length > 0) {
        const msg = dedent`
        Config files at the following paths are dirty:\n
        ${dirtyConfigs.join("\n")}

        Please commit them before applying this command with the --write flag
        `
        throw new RuntimeError(msg, { dirtyConfigs })
      }
    }

    // Iterate over updated configs and print or write
    for (const { path, specs } of updatedConfigs) {
      const out = dumpSpec(specs)

      if (opts.write) {
        log.info(`Updating file at path ${path}`)
        await writeFile(path, out)
      } else {
        if (configPaths.length > 1) {
          log.info(`# Updated config for garden.yml file at path ${path}:`)
        }
        log.info(out)
      }
    }

    if (updatedConfigs.length === 0) {
      log.info("Nothing to update.")
    } else if (opts.write) {
      log.info("")
      log.info("Finished updating config files. Please review the changes before commiting them.")
    }

    return { result: { updatedConfigs } }
  }
}

/**
 * Dump JSON specs to YAML. Join specs by `---`.
 */
export function dumpSpec(specs: any[]) {
  return specs.map((spec) => safeDump(spec)).join("\n---\n\n")
}

/**
 * Recursively search for the project root by checking if the path has a project level `garden.yml` file
 */
async function findRoot(path: string): Promise<string | null> {
  const configFilePath = await getConfigFilePath(path)
  let isProjectRoot = false
  try {
    const rawSpecs = await readYaml(configFilePath)
    isProjectRoot = rawSpecs.find((spec) => !!spec.project || spec.kind === "Project")
  } catch (err) {
    // no op
  }
  if (isProjectRoot) {
    return path
  }

  // We're at the file system root and no project file was found
  if (parse(path).root) {
    return null
  }
  return findRoot(resolve(path, ".."))
}

/**
 * Read the contents of a YAML file and dump to JSON
 */
async function readYaml(path: string) {
  const fileData = await readFile(path)
  const rawSpecs = await loadAndValidateYaml(fileData.toString(), path)
  return rawSpecs.filter(Boolean) // Ignore empty resources
}

/**
 * Returns a spec with the flat config style.
 *
 * That is, this:
 * ```yaml
 * project:
 *   providers:
 *    ...
 * ```
 * becomes:
 * ```yaml
 * kind: Project:
 * providers:
 * ...
 * ```
 */
function applyFlatStyle(spec: any) {
  if (spec.project) {
    const project = cloneDeep(spec.project)
    return {
      kind: "Project",
      ...project,
    }
  } else if (spec.module) {
    const module = cloneDeep(spec.module)
    return {
      kind: "Module",
      ...module,
    }
  }
  return cloneDeep(spec)
}

/**
 * Returns a spec with `local-openfaas` set to `openfaas` at both the provider and module type level.
 * Remove the `local-openfaas` provider if `openfaas` is already configured.
 */
function removeLocalOpenFaas(spec: any) {
  const clone = cloneDeep(spec)
  const isProject = spec.kind === "Project"

  // Remove local-openfaas from modules
  if (spec.type === "local-openfaas") {
    clone.type = "openfaas"
  }

  // Remove local-openfaas from projects
  if (isProject) {
    let hasOpenfaas = false

    // Provider nested under environment
    if ((spec.environments || []).length > 0) {
      for (const [envIdx, env] of spec.environments.entries()) {
        if (!env.providers) {
          continue
        }

        for (const [providerIdx, provider] of env.providers.entries()) {
          hasOpenfaas = !!env.providers.find((p) => p.name === "openfaas")
          if (provider.name === "local-openfaas" && hasOpenfaas) {
            // openfaas provider is already configured so we remove the local-openfaas provider
            clone.environments[envIdx].providers.splice(providerIdx, 1)
          } else if (provider.name === "local-openfaas") {
            // otherwise we rename it
            clone.environments[envIdx].providers[providerIdx].name = "openfaas"
          }
        }
      }
    }

    // Provider nested under environment
    if (spec.providers) {
      hasOpenfaas = !!spec.providers.find((p) => p.name === "openfaas")
      for (const [providerIdx, provider] of spec.providers.entries()) {
        if (provider.name === "local-openfaas" && hasOpenfaas) {
          clone.providers.splice(providerIdx, 1)
        } else if (provider.name === "local-openfaas") {
          clone.providers[providerIdx].name = "openfaas"
        }
      }
    }
  }
  return clone
}

/**
 * Returns a spec with the `environmentDefaults` field removed and its contents mapped
 * to their respective top-level keys.
 */
function removeEnvironmentDefaults(spec: any, path: string) {
  const clone = cloneDeep(spec)

  if (spec.environmentDefaults) {
    if (spec.environmentDefaults.varfile) {
      if (spec.varfile) {
        const msg = dedent`
          Found a project level \`varfile\` field with value ${spec.varfile} in config at path ${path}
          when attempting to re-assign the \`varfile\` field under the
          \`environmentDefaults\` directive (with value ${spec.environmentDefaults.varfile}).
          Please resolve manually and then run this command again.
        `
        throw new ConfigurationError(msg, { path })
      } else {
        clone.varfile = spec.environmentDefaults.varfile
      }
    }
    if (spec.environmentDefaults.variables) {
      // Merge variables
      clone.variables = {
        ...(spec.variables || {}),
        ...spec.environmentDefaults.variables,
      }
    }

    if (spec.environmentDefaults.providers) {
      const providers = cloneDeep(spec.providers) || []
      const envProviders = cloneDeep(spec.environmentDefaults.providers)
      clone.providers = [...providers, ...envProviders]
    }
    delete clone.environmentDefaults
  }
  return clone
}
