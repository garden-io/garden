/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import Bluebird from "bluebird"
import normalize = require("normalize-path")
import { mapValues, keyBy, sortBy, omit } from "lodash"
import { createHash } from "crypto"
import { validateSchema } from "../config/validation"
import { join, relative, isAbsolute } from "path"
import { GARDEN_VERSIONFILE_NAME as GARDEN_TREEVERSION_FILENAME } from "../constants"
import { pathExists, readFile, writeFile } from "fs-extra"
import { ConfigurationError } from "../exceptions"
import { ExternalSourceType, getRemoteSourcesDirname, getRemoteSourceRelPath } from "../util/ext-source-util"
import { ModuleConfig, serializeConfig } from "../config/module"
import { LogEntry } from "../logger/log-entry"
import { treeVersionSchema, moduleVersionSchema } from "../config/common"
import { Warning } from "../db/entities/warning"
import { dedent } from "../util/string"

export const NEW_MODULE_VERSION = "0000000000"
const fileCountWarningThreshold = 10000

export interface TreeVersion {
  contentHash: string
  files: string[]
}

export interface TreeVersions {
  [moduleName: string]: TreeVersion
}

export interface ModuleVersion {
  versionString: string
  dependencyVersions: TreeVersions
  files: string[]
}

interface NamedTreeVersion extends TreeVersion {
  name: string
}

export interface GetFilesParams {
  log: LogEntry
  path: string
  pathDescription?: string
  include?: string[]
  exclude?: string[]
}

export interface RemoteSourceParams {
  url: string
  name: string
  sourceType: ExternalSourceType
  log: LogEntry
}

export interface VcsFile {
  path: string
  hash: string
}

export abstract class VcsHandler {
  constructor(protected gardenDirPath: string, protected ignoreFiles: string[]) {}

  abstract name: string
  abstract async getRepoRoot(log: LogEntry, path: string): Promise<string>
  abstract async getFiles(params: GetFilesParams): Promise<VcsFile[]>
  abstract async ensureRemoteSource(params: RemoteSourceParams): Promise<string>
  abstract async updateRemoteSource(params: RemoteSourceParams): Promise<void>
  abstract async getOriginName(log: LogEntry): Promise<string | undefined>

  async getTreeVersion(log: LogEntry, projectName: string, moduleConfig: ModuleConfig): Promise<TreeVersion> {
    const configPath = moduleConfig.configPath

    let files = await this.getFiles({
      log,
      path: moduleConfig.path,
      pathDescription: "module root",
      include: moduleConfig.include,
      exclude: moduleConfig.exclude,
    })

    if (files.length > fileCountWarningThreshold) {
      await Warning.emit({
        key: `${projectName}-filecount-${moduleConfig.name}`,
        log,
        message: dedent`
          Large number of files (${files.length}) found in module ${moduleConfig.name}. You may need to configure file exclusions.
          See https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories for details.
        `,
      })
    }

    files = sortBy(files, "path")
      // Don't include the config file in the file list
      .filter((f) => !configPath || f.path !== configPath)

    const contentHash = files.length > 0 ? hashStrings(files.map((f) => f.hash)) : NEW_MODULE_VERSION

    return { contentHash, files: files.map((f) => f.path) }
  }

  async resolveTreeVersion(log: LogEntry, projectName: string, moduleConfig: ModuleConfig): Promise<TreeVersion> {
    // the version file is used internally to specify versions outside of source control
    const versionFilePath = join(moduleConfig.path, GARDEN_TREEVERSION_FILENAME)
    const fileVersion = await readTreeVersionFile(versionFilePath)
    return fileVersion || (await this.getTreeVersion(log, projectName, moduleConfig))
  }

  async resolveVersion(
    log: LogEntry,
    projectName: string,
    moduleConfig: ModuleConfig,
    dependencies: ModuleConfig[]
  ): Promise<ModuleVersion> {
    const treeVersion = await this.resolveTreeVersion(log, projectName, moduleConfig)

    validateSchema(treeVersion, treeVersionSchema(), {
      context: `${this.name} tree version for module at ${moduleConfig.path}`,
    })

    if (dependencies.length === 0) {
      const versionString = getVersionString(moduleConfig, [{ ...treeVersion, name: moduleConfig.name }])
      return {
        versionString,
        dependencyVersions: {},
        files: treeVersion.files,
      }
    }

    const namedDependencyVersions = await Bluebird.map(dependencies, async (m: ModuleConfig) => ({
      name: m.name,
      ...(await this.resolveTreeVersion(log, projectName, m)),
    }))
    const dependencyVersions = mapValues(keyBy(namedDependencyVersions, "name"), (v) => omit(v, "name"))

    // keep the module at the top of the chain, dependencies sorted by name
    const allVersions: NamedTreeVersion[] = [{ name: moduleConfig.name, ...treeVersion }].concat(
      namedDependencyVersions
    )

    return {
      dependencyVersions,
      versionString: getVersionString(moduleConfig, allVersions),
      files: treeVersion.files,
    }
  }

  getRemoteSourcesDirname(type: ExternalSourceType) {
    return getRemoteSourcesDirname(type)
  }

  /**
   * Returns the path to the remote source directory, relative to the project level Garden directory (.garden)
   */
  getRemoteSourceRelPath(name: string, url: string, sourceType: ExternalSourceType) {
    return getRemoteSourceRelPath({ name, url, sourceType })
  }
}

async function readVersionFile(path: string, schema: Joi.Schema): Promise<any> {
  if (!(await pathExists(path))) {
    return null
  }

  // this is used internally to specify version outside of source control
  const versionFileContents = (await readFile(path)).toString().trim()

  if (!versionFileContents) {
    return null
  }

  try {
    return validateSchema(JSON.parse(versionFileContents), schema)
  } catch (error) {
    throw new ConfigurationError(`Unable to parse ${path} as valid version file`, {
      path,
      versionFileContents,
      error,
    })
  }
}

export async function readTreeVersionFile(path: string): Promise<TreeVersion | null> {
  return readVersionFile(path, treeVersionSchema())
}

export async function readModuleVersionFile(path: string): Promise<ModuleVersion | null> {
  return readVersionFile(path, moduleVersionSchema())
}

/**
 * Writes a normalized TreeVersion file to the specified directory
 *
 * @param dir The directory to write the file to
 * @param version The TreeVersion for the directory
 */
export async function writeTreeVersionFile(dir: string, version: TreeVersion) {
  const processed = {
    ...version,
    files: version.files
      // Always write relative paths, normalized to POSIX style
      .map((f) => normalize(isAbsolute(f) ? relative(dir, f) : f))
      .filter((f) => f !== GARDEN_TREEVERSION_FILENAME),
  }
  const path = join(dir, GARDEN_TREEVERSION_FILENAME)
  await writeFile(path, JSON.stringify(processed, null, 4) + "\n")
}

export async function writeModuleVersionFile(path: string, version: ModuleVersion) {
  await writeFile(path, JSON.stringify(version, null, 4) + "\n")
}

/**
 * We prefix with "v-" to prevent this.version from being read as a number when only a prefix of the
 * commit hash is used, and that prefix consists of only numbers. This can cause errors in certain contexts
 * when the version string is used in template variables in configuration files.
 */
export function getVersionString(moduleConfig: ModuleConfig, treeVersions: NamedTreeVersion[]) {
  return `v-${hashVersions(moduleConfig, treeVersions)}`
}

/**
 * The versions argument should consist of moduleConfig's tree version, and the tree versions of its dependencies.
 */
export function hashVersions(moduleConfig: ModuleConfig, versions: NamedTreeVersion[]) {
  // We omit the configPath, path, and outputs fields as these can between users and runtimes
  const configString = serializeConfig(omit(moduleConfig, ["configPath", "path", "outputs"]))
  const versionStrings = sortBy(versions, "name").map((v) => `${v.name}_${v.contentHash}`)
  return hashStrings([configString, ...versionStrings])
}

function hashStrings(hashes: string[]) {
  const versionHash = createHash("sha256")
  versionHash.update(hashes.join("."))
  return versionHash.digest("hex").slice(0, 10)
}
