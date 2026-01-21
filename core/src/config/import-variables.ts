/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv from "dotenv"
import { resolve } from "path"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { isPlainObject } from "lodash-es"
import { execa } from "execa"
import tmp from "tmp-promise"

import type { Log } from "../logger/log-entry.js"
import type { StringMap } from "./common.js"
import type { GardenCloudApi } from "../cloud/api/api.js"
import type { ImportVariablesConfig, ImportVarsSourceFormat } from "./project.js"
import { ConfigurationError, RuntimeError } from "../exceptions.js"
import { loadAndValidateYaml } from "./base.js"

/**
 * Loads variables from all configured import sources.
 * Variables are merged in order, with later sources taking precedence.
 */
export async function loadImportedVariables({
  importVariables,
  projectRoot,
  log,
  cloudApi,
  environmentName,
  legacyProjectId,
}: {
  importVariables: ImportVariablesConfig
  projectRoot: string
  log: Log
  cloudApi?: GardenCloudApi
  environmentName: string
  legacyProjectId?: string
}): Promise<StringMap> {
  if (!importVariables || importVariables.length === 0) {
    return {}
  }

  let result: StringMap = {}

  for (const source of importVariables) {
    let vars: StringMap = {}

    switch (source.from) {
      case "garden-cloud":
        if (!cloudApi) {
          log.warn(`Cannot import variables from Garden Cloud: Not logged in. Skipping source.`)
          continue
        }
        log.info(`Fetching variables from Garden Cloud (list: ${source.list})`)
        vars = await loadFromGardenCloud({
          cloudApi,
          variableListId: source.list,
          environmentName,
          legacyProjectId,
          log,
        })
        break

      case "file":
        log.info(`Loading variables from file: ${source.path}`)
        vars = await loadFromFile({
          projectRoot,
          path: source.path,
          format: source.format,
          log,
        })
        break

      case "exec":
        log.info(`Running command to load variables: ${source.command.join(" ")}`)
        vars = await loadFromExec({
          projectRoot,
          command: source.command,
          format: source.format,
          environmentName,
          log,
        })
        break
    }

    // Merge variables, with later sources taking precedence
    result = { ...result, ...vars }
  }

  return result
}

/**
 * Loads variables from a Garden Cloud variable list.
 */
async function loadFromGardenCloud({
  cloudApi,
  variableListId,
  environmentName,
  legacyProjectId,
  log,
}: {
  cloudApi: GardenCloudApi
  variableListId: string
  environmentName: string
  legacyProjectId?: string
  log: Log
}): Promise<StringMap> {
  // Use the existing getVariables method but for a single list
  const result = await cloudApi.getVariables({
    importVariables: [{ from: "garden-cloud", list: variableListId }],
    environmentName,
    log,
    legacyProjectId,
  })
  return result
}

/**
 * Loads variables from a local file.
 */
async function loadFromFile({
  projectRoot,
  path,
  format,
  log,
}: {
  projectRoot: string
  path: string
  format: ImportVarsSourceFormat
  log: Log
}): Promise<StringMap> {
  const resolvedPath = resolve(projectRoot, path)

  let fileContents: Buffer
  try {
    fileContents = await readFile(resolvedPath)
    log.silly(() => `Loaded ${fileContents.length} bytes from ${resolvedPath}`)
  } catch (error: any) {
    if (error.code === "ENOENT") {
      log.warn(
        `Could not find import variables file at path '${path}'. Absolute path: ${resolvedPath}. No variables imported from this source.`
      )
      return {}
    }
    throw new ConfigurationError({
      message: `Unable to load import variables file at '${path}': ${error}`,
    })
  }

  return parseVariablesContent(fileContents.toString("utf-8"), format, path)
}

/**
 * Loads variables by running a command that writes output to a temp file.
 */
async function loadFromExec({
  projectRoot,
  command,
  format,
  environmentName,
  log,
}: {
  projectRoot: string
  command: string[]
  format: ImportVarsSourceFormat
  environmentName: string
  log: Log
}): Promise<StringMap> {
  const tmpFile = await tmp.file({ prefix: "garden-import-vars-", postfix: `.${format}` })

  try {
    const [cmd, ...args] = command

    const result = await execa(cmd, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        GARDEN_OUTPUT_PATH: tmpFile.path,
        GARDEN_ENVIRONMENT: environmentName,
      },
      reject: false,
    })

    if (result.exitCode !== 0) {
      throw new RuntimeError({
        message: `Command "${command.join(" ")}" failed with exit code ${result.exitCode}.\nStderr: ${result.stderr || "(empty)"}`,
      })
    }

    // Check if the file was written to
    if (!existsSync(tmpFile.path)) {
      log.warn(
        `Command "${command.join(" ")}" did not write to GARDEN_OUTPUT_PATH. No variables imported from this source.`
      )
      return {}
    }

    // Read the file contents
    const fileContents = await readFile(tmpFile.path, "utf-8")

    // Check if file is empty
    if (fileContents.trim() === "") {
      log.warn(
        `Command "${command.join(" ")}" wrote an empty file to GARDEN_OUTPUT_PATH. No variables imported from this source.`
      )
      return {}
    }

    return parseVariablesContent(fileContents, format, `output from command "${command.join(" ")}"`)
  } finally {
    // Clean up temp file
    await tmpFile.cleanup()
  }
}

/**
 * Parses variable content based on the specified format.
 */
async function parseVariablesContent(
  content: string,
  format: ImportVarsSourceFormat,
  sourceDescription: string
): Promise<StringMap> {
  switch (format) {
    case "json": {
      try {
        const parsed = JSON.parse(content)
        if (!isPlainObject(parsed)) {
          throw new ConfigurationError({
            message: `Import variables from ${sourceDescription} must be a valid plain JSON object. Got: ${typeof parsed}`,
          })
        }
        // Convert all values to strings
        return objectToStringMap(parsed)
      } catch (error: any) {
        if (error instanceof ConfigurationError) {
          throw error
        }
        throw new ConfigurationError({
          message: `Failed to parse JSON from ${sourceDescription}: ${error.message}`,
        })
      }
    }

    case "yaml": {
      const loaded = await loadAndValidateYaml({
        content,
        filename: undefined,
        version: "1.2",
        sourceDescription: `import variables from ${sourceDescription}`,
      })

      if (loaded.length === 0) {
        return {}
      }

      if (loaded.length > 1) {
        throw new ConfigurationError({
          message: `Import variables from ${sourceDescription} must be a single YAML document. Got multiple (${loaded.length}) YAML documents`,
        })
      }

      const data = loaded[0].toJS() || {}
      if (!isPlainObject(data)) {
        throw new ConfigurationError({
          message: `Import variables from ${sourceDescription} must be a single plain YAML mapping. Got: ${typeof data}`,
        })
      }

      return objectToStringMap(data)
    }

    case "dotenv": {
      const parsed = dotenv.parse(content)
      return parsed as StringMap
    }

    default:
      throw new ConfigurationError({
        message: `Unknown import variables format: ${format}`,
      })
  }
}

/**
 * Converts a plain object to a StringMap, converting all values to strings.
 */
function objectToStringMap(obj: Record<string, any>): StringMap {
  const result: StringMap = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = ""
    } else if (typeof value === "object") {
      result[key] = JSON.stringify(value)
    } else {
      result[key] = String(value)
    }
  }
  return result
}
