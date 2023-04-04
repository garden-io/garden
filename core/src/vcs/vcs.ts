/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import normalize = require("normalize-path")
import { sortBy, pick } from "lodash"
import { createHash } from "crypto"
import { validateSchema } from "../config/validation"
import { pathExists, readFile } from "fs-extra"
import { ConfigurationError } from "../exceptions"
import { ExternalSourceType, getRemoteSourcesDirname, getRemoteSourceRelPath } from "../util/ext-source-util"
import { ModuleConfig, serializeConfig } from "../config/module"
import type { Log } from "../logger/log-entry"
import { dedent } from "../util/string"
import { fixedProjectExcludes } from "../util/fs"
import { pathToCacheContext, TreeCache } from "../cache"
import type { ServiceConfig } from "../config/service"
import type { TaskConfig } from "../config/task"
import type { TestConfig } from "../config/test"
import type { GardenModule } from "../types/module"
import { validateInstall } from "../util/validateInstall"
import { isActionConfig } from "../actions/base"
import type { BaseActionConfig } from "../actions/types"
import { Garden } from "../garden"
import chalk = require("chalk")

const AsyncLock = require("async-lock")
const scanLock = new AsyncLock()

export const versionStringPrefix = "v-"
export const NEW_RESOURCE_VERSION = "0000000000"
const fileCountWarningThreshold = 10000

const minGitVersion = "2.14.0"
export const gitVersionRegex = /git\s+version\s+v?(\d+.\d+.\d+)/

/**
 * throws if no git is installed or version is too old
 */
export async function validateGitInstall() {
  await validateInstall({
    minVersion: minGitVersion,
    name: "git",
    versionCommand: { cmd: "git", args: ["--version"] },
    versionRegex: gitVersionRegex,
  })
}

export interface TreeVersion {
  contentHash: string
  files: string[]
}

export interface TreeVersions {
  [moduleName: string]: TreeVersion
}

// TODO: rename, maybe to ResourceVersion
export interface ModuleVersion {
  versionString: string
  dependencyVersions: DependencyVersions
  files: string[]
}

export interface ActionVersion extends ModuleVersion {
  configVersion: string
  sourceVersion: string
}

export interface NamedModuleVersion extends ModuleVersion {
  name: string
}

export interface DependencyVersions {
  [key: string]: string
}

export interface NamedTreeVersion extends TreeVersion {
  name: string
}

export interface VcsInfo {
  branch: string
  commitHash: string
  originUrl: string
}

export interface GetFilesParams {
  log: Log
  path: string
  pathDescription?: string
  include?: string[]
  exclude?: string[]
  filter?: (path: string) => boolean
  failOnPrompt?: boolean
}

export interface RemoteSourceParams {
  url: string
  name: string
  sourceType: ExternalSourceType
  log: Log
  failOnPrompt?: boolean
}

export interface VcsFile {
  path: string
  hash: string
}

export interface VcsHandlerParams {
  garden?: Garden
  projectRoot: string
  gardenDirPath: string
  ignoreFile: string
  cache: TreeCache
}

export abstract class VcsHandler {
  protected garden?: Garden
  protected projectRoot: string
  protected gardenDirPath: string
  protected ignoreFile: string
  private cache: TreeCache

  constructor(params: VcsHandlerParams) {
    this.garden = params.garden
    this.projectRoot = params.projectRoot
    this.gardenDirPath = params.gardenDirPath
    this.ignoreFile = params.ignoreFile
    this.cache = params.cache
  }

  abstract name: string
  abstract getRepoRoot(log: Log, path: string): Promise<string>
  abstract getFiles(params: GetFilesParams): Promise<VcsFile[]>
  abstract ensureRemoteSource(params: RemoteSourceParams): Promise<string>
  abstract updateRemoteSource(params: RemoteSourceParams): Promise<void>
  abstract getPathInfo(log: Log, path: string): Promise<VcsInfo>

  async getTreeVersion(
    log: Log,
    projectName: string,
    config: ModuleConfig | BaseActionConfig,
    force = false
  ): Promise<TreeVersion> {
    const configPath = getConfigFilePath(config)
    const path = getConfigBasePath(config)

    // Apply project root excludes if the module config is in the project root and `include` isn't set
    const exclude =
      path === this.projectRoot && !config.include
        ? [...(config.exclude || []), ...fixedProjectExcludes]
        : config.exclude

    let result: TreeVersion = { contentHash: NEW_RESOURCE_VERSION, files: [] }

    const cacheKey = getResourceTreeCacheKey(config)

    // Make sure we don't concurrently scan the exact same context
    await scanLock.acquire(cacheKey.join(":"), async () => {
      const description = describeConfig(config)

      if (!force) {
        const cached = this.cache.get(log, cacheKey)
        if (cached) {
          log.silly(`Got cached tree version for ${description} (key ${cacheKey})`)
          result = cached
          return
        }
      }

      // No need to scan for files if nothing should be included
      if (!(config.include && config.include.length === 0)) {
        let files = await this.getFiles({
          log,
          path,
          pathDescription: description + " root",
          include: config.include,
          exclude,
        })

        if (files.length > fileCountWarningThreshold) {
          // TODO-0.13.0: This will be repeated for modules and actions resulting from module conversion
          await this.garden?.emitWarning({
            key: `${projectName}-filecount-${config.name}`,
            log,
            message: chalk.yellow(dedent`
              Large number of files (${files.length}) found in ${description}. You may need to configure file exclusions.
              See https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories for details.
            `),
          })
        }

        files = sortBy(files, "path")
          // Don't include the config file in the file list
          .filter((f) => !configPath || f.path !== configPath)

        result.contentHash = hashStrings(files.map((f) => f.hash))
        result.files = files.map((f) => f.path)
      }

      this.cache.set(log, cacheKey, result, pathToCacheContext(path))
    })

    return result
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

/**
 * We prefix with "v-" to prevent this.version from being read as a number when only a prefix of the
 * commit hash is used, and that prefix consists of only numbers. This can cause errors in certain contexts
 * when the version string is used in template variables in configuration files.
 */
export function getModuleVersionString(
  moduleConfig: ModuleConfig,
  treeVersion: NamedTreeVersion,
  dependencyModuleVersions: NamedModuleVersion[]
) {
  // TODO: allow overriding the prefix
  return `${versionStringPrefix}${hashModuleVersion(moduleConfig, treeVersion, dependencyModuleVersions)}`
}

/**
 * Compute the version of the given module, based on its configuration and the versions of its build dependencies.
 * The versions argument should consist of moduleConfig's tree version, and the tree versions of its dependencies.
 */
export function hashModuleVersion(
  moduleConfig: ModuleConfig,
  treeVersion: NamedTreeVersion,
  dependencyModuleVersions: NamedModuleVersion[]
) {
  // If a build config is provided, we use that.
  // Otherwise, we use the full module config, omitting the configPath, path, and outputs fields, as well as individual
  // entity configuration fields, as these often vary between environments and runtimes but are unlikely to impact the
  // build output.
  const configToHash =
    moduleConfig.buildConfig ||
    pick(moduleConfig, ["apiVersion", "name", "spec", "type", "variables", "varfile", "inputs"])

  const configString = serializeConfig(configToHash)

  const versionStrings = sortBy(
    [[treeVersion.name, treeVersion.contentHash], ...dependencyModuleVersions.map((v) => [v.name, v.versionString])],
    (vs) => vs[0]
  ).map((vs) => vs[1])

  return hashStrings([configString, ...versionStrings])
}

/**
 * Return the version string for the given Stack Graph entity (i.e. service, task or test).
 * It is simply a hash of the module version and the configuration of the entity.
 *
 * @param module        The module containing the entity in question
 * @param entityConfig  The configuration of the entity
 */
export function getEntityVersion(module: GardenModule, entityConfig: ServiceConfig | TaskConfig | TestConfig) {
  const configString = serializeConfig(entityConfig)
  return `${versionStringPrefix}${hashStrings([module.version.versionString, configString])}`
}

export function hashStrings(hashes: string[]) {
  const versionHash = createHash("sha256")
  versionHash.update(hashes.join("."))
  return versionHash.digest("hex").slice(0, 10)
}

export function getResourceTreeCacheKey(config: ModuleConfig | BaseActionConfig) {
  const cacheKey = ["source", getConfigBasePath(config)]

  if (config.include) {
    cacheKey.push("include", hashStrings(config.include.sort()))
  }
  if (config.exclude) {
    cacheKey.push("exclude", hashStrings(config.exclude.sort()))
  }

  return cacheKey
}

export function getConfigFilePath(config: ModuleConfig | BaseActionConfig) {
  return isActionConfig(config) ? config.internal?.configFilePath : config.configPath
}

export function getConfigBasePath(config: ModuleConfig | BaseActionConfig) {
  return isActionConfig(config) ? config.internal.basePath : config.path
}

export function describeConfig(config: ModuleConfig | BaseActionConfig) {
  return isActionConfig(config) ? `${config.kind} action ${config.name}` : `module ${config.name}`
}
