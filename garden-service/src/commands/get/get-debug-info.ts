/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import {
  Command,
  CommandParams,
  ChoicesParameter,
} from "../base"
import { findProjectConfig } from "../../config/base"
import { ensureDir, copy, remove, pathExists, writeFile } from "fs-extra"
import { getPackageVersion } from "../../util/util"
import { platform, release } from "os"
import { join, parse, relative } from "path"
import execa = require("execa")
import { LogEntry } from "../../logger/log-entry"
import { deline } from "../../util/string"
import { scanDirectory, getIgnorer } from "../../util/fs"
import {
  CONFIG_FILENAME,
  ERROR_LOG_FILENAME,
  GARDEN_DIR_NAME,
} from "../../constants"
import dedent = require("dedent")
import { Garden } from "../../garden"
import { zipFolder } from "../../util/archive"

export const TEMP_DEBUG_ROOT = "tmp"
export const SYSTEM_INFO_FILENAME = "systemInfo.json"
export const DEBUG_ZIP_FILENAME = "debug-info-TIMESTAMP.zip"
export const PROVIDER_INFO_FILENAME_NO_EXT = "info"

export async function generateBasicDebugInfoReport(root: string, log: LogEntry) {
  const tempPath = join(root, GARDEN_DIR_NAME, TEMP_DEBUG_ROOT)
  await collectBasicDebugInfo(root, log)

  log.info("Preparing archive.")
  const outputFilename = DEBUG_ZIP_FILENAME.replace("TIMESTAMP", new Date().toISOString())
  await zipFolder(tempPath, join(root, outputFilename), log)

  await remove(tempPath)
  log.info(`Done! Please find your report under ${root}.`)
}

export async function collectBasicDebugInfo(root: string, log: LogEntry) {
  log.info("Collecting project configuration files.")
  // Find project definition
  const config = await findProjectConfig(root, true)
  if (!config) {
    log.error(deline`
      Couldn't find a garden.yml with a valid project definition.
      Please run this command from the root of your Garden project.`)
    process.exit(1)
  }

  // Create temporary folder inside .garden/ at root of project
  const tempPath = join(root, GARDEN_DIR_NAME, TEMP_DEBUG_ROOT)
  await remove(tempPath)
  await ensureDir(tempPath)

  // Copy project definition in tmp folder
  await copy(join(root, CONFIG_FILENAME), join(tempPath, CONFIG_FILENAME))
  // Check if error logs exist and copy it over if it does
  if (await pathExists(join(root, ERROR_LOG_FILENAME))) {
    await copy(join(root, ERROR_LOG_FILENAME), join(tempPath, ERROR_LOG_FILENAME))
  }

  // Find all services paths
  const ignorer = await getIgnorer(root)
  const scanOpts = {
    filter: (path) => {
      const relPath = relative(root, path)
      return !ignorer.ignores(relPath)
    },
  }
  const paths: string[] = []
  for await (const item of scanDirectory(root, scanOpts)) {
    if (!item) {
      continue
    }

    const parsedPath = parse(item.path)

    if (parsedPath.dir === root) {
      continue
    }

    if (parsedPath.base !== CONFIG_FILENAME) {
      continue
    }

    paths.push(parsedPath.dir)
  }

  // Copy all the service configuration files
  for (const servicePath of paths) {
    const tempServicePath = join(tempPath, relative(root, servicePath))
    await ensureDir(tempServicePath)
    await copy(join(servicePath, CONFIG_FILENAME), join(tempServicePath, CONFIG_FILENAME))

    // Check if error logs exist and copy them over if they do
    if (await pathExists(join(servicePath, ERROR_LOG_FILENAME))) {
      await copy(join(servicePath, ERROR_LOG_FILENAME), join(tempServicePath, ERROR_LOG_FILENAME))
    }
  }

  // Run system diagnostic
  await collectSystemDiagnostic(root, log)

}

export async function collectSystemDiagnostic(root: string, log: LogEntry) {

  log.info("Collecting OS basic information.")

  const tempPath = join(root, GARDEN_DIR_NAME, TEMP_DEBUG_ROOT)
  await ensureDir(tempPath)

  let dockerVersion = ""
  try {
    dockerVersion = await execa.stdout("docker", ["--version"])
  } catch (error) {
    log.error("Error encountered while executing docker")
    log.error(error)
  }

  const systemInfo = {
    gardenVersion: getPackageVersion(),
    platform: platform(),
    platformVersion: release(),
    dockerVersion,
  }

  await writeFile(join(tempPath, SYSTEM_INFO_FILENAME), JSON.stringify(systemInfo, null, 4), "utf8")

}

export async function collectProviderDebugInfo(garden: Garden, log: LogEntry, tempPath: string, format: string) {

  await ensureDir(tempPath)

  const providersDebugInfo = await garden.actions.getDebugInfo({ log })

  for (const [providerName, info] of Object.entries(providersDebugInfo)) {
    const prividerPath = join(tempPath, providerName)
    await ensureDir(prividerPath)
    const outputFileName = `${PROVIDER_INFO_FILENAME_NO_EXT}.${format}`
    await writeFile(join(prividerPath, outputFileName), renderInfo(info, format), "utf8")
  }
}

function renderInfo(info: any, format: string) {
  if (format === "json") {
    return JSON.stringify(info, null, 4)
  } else {
    return yaml.safeDump(info, { noRefs: true, skipInvalid: true })
  }
}

const debugInfoArguments = {}

const debugInfoOptions = {
  format: new ChoicesParameter({
    help: "The output format for plugin-generated debug info.",
    choices: ["json", "yaml"],
    defaultValue: "yaml",
  }),
}

type Args = typeof debugInfoArguments
type Opts = typeof debugInfoOptions

export class GetDebugInfoCommand extends Command<Args, Opts> {
  name = "debug-info"
  help = "Outputs the status of your environment for debug purposes."

  description = dedent`
    Examples:

    garden get debug-info                # create a zip file on the root of the project with debug information
    garden get debug-info --format yaml  # outputs the provider info as yaml files (default as json)
  `

  arguments = debugInfoArguments
  options = debugInfoOptions

  async action({ garden, log, opts }: CommandParams<Args, Opts>) {

    const tempPath = join(garden.projectRoot, GARDEN_DIR_NAME, TEMP_DEBUG_ROOT)
    await collectBasicDebugInfo(garden.projectRoot, log)

    await collectProviderDebugInfo(garden, log, tempPath, opts.format)

    log.info("Preparing archive.")
    const outputFilename = DEBUG_ZIP_FILENAME.replace("TIMESTAMP", new Date().toISOString())
    await zipFolder(tempPath, join(garden.projectRoot, outputFilename), log)

    await remove(tempPath)

    log.info(`Done! Please find your report under ${garden.projectRoot}.`)

    return { result: 0 }
  }
}
