/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { mapValues, keyBy, last, sortBy, omit } from "lodash"
import { createHash } from "crypto"
import * as Joi from "joi"
import { validate } from "../config/common"
import { join } from "path"
import { GARDEN_VERSIONFILE_NAME } from "../constants"
import { pathExists, readFile, writeFile, stat } from "fs-extra"
import { ConfigurationError } from "../exceptions"
import {
  ExternalSourceType,
  getRemoteSourcesDirname,
  getRemoteSourcePath,
} from "../util/ext-source-util"
import { ModuleConfig, serializeConfig } from "../config/module"
import { LogNode } from "../logger/log-node"

export const NEW_MODULE_VERSION = "0000000000"

export interface TreeVersion {
  latestCommit: string
  dirtyTimestamp: number | null
}

export interface TreeVersions { [moduleName: string]: TreeVersion }

export interface ModuleVersion {
  versionString: string
  dirtyTimestamp: number | null
  dependencyVersions: TreeVersions
}

interface NamedTreeVersion extends TreeVersion {
  name: string
}

const versionStringSchema = Joi.string()
  .regex(/^v/)
  .required()
  .description("String representation of the module version.")

const dirtyTimestampSchema = Joi.number()
  .allow(null)
  .required()
  .description(
    "Set to the last modified time (as UNIX timestamp) if the module contains uncommitted changes, otherwise null.",
  )

export const treeVersionSchema = Joi.object()
  .keys({
    latestCommit: Joi.string()
      .required()
      .description("The latest commit hash of the module source."),
    dirtyTimestamp: dirtyTimestampSchema,
  })

export const moduleVersionSchema = Joi.object()
  .keys({
    versionString: versionStringSchema,
    dirtyTimestamp: dirtyTimestampSchema,
    dependencyVersions: Joi.object()
      .pattern(/.+/, treeVersionSchema)
      .default(() => ({}), "{}")
      .description("The version of each of the dependencies of the module."),
  })

export interface RemoteSourceParams {
  url: string,
  name: string,
  sourceType: ExternalSourceType,
  log: LogNode,
}

export abstract class VcsHandler {
  constructor(protected projectRoot: string) { }

  abstract name: string
  abstract async getLatestCommit(path: string): Promise<string>
  abstract async getDirtyFiles(path: string): Promise<string[]>
  abstract async ensureRemoteSource(params: RemoteSourceParams): Promise<string>
  abstract async updateRemoteSource(params: RemoteSourceParams): Promise<void>

  async getTreeVersion(path: string) {
    const commitHash = await this.getLatestCommit(path)
    const dirtyFiles = await this.getDirtyFiles(path)

    let latestDirty = 0

    // for dirty trees, we append the last modified time of last modified or added file
    if (dirtyFiles.length) {
      const stats = await Bluebird.filter(dirtyFiles, (file: string) => pathExists(file))
        .map((file: string) => stat(file))

      let mtimes = stats.map((s) => Math.round(s.mtime.getTime() / 1000))
      let latest = mtimes.sort().slice(-1)[0]

      if (latest > latestDirty) {
        latestDirty = latest
      }
    }

    return {
      latestCommit: commitHash,
      dirtyTimestamp: latestDirty || null,
    }
  }

  async resolveTreeVersion(path: string): Promise<TreeVersion> {
    // the version file is used internally to specify versions outside of source control
    const versionFilePath = join(path, GARDEN_VERSIONFILE_NAME)
    const fileVersion = await readTreeVersionFile(versionFilePath)
    return fileVersion || this.getTreeVersion(path)
  }

  async resolveVersion(moduleConfig: ModuleConfig, dependencies: ModuleConfig[]): Promise<ModuleVersion> {
    const treeVersion = await this.resolveTreeVersion(moduleConfig.path)

    validate(treeVersion, treeVersionSchema, {
      context: `${this.name} tree version for module at ${moduleConfig.path}`,
    })

    if (dependencies.length === 0) {
      const versionString = getVersionString(
        moduleConfig,
        [{ ...treeVersion, name: moduleConfig.name }],
        treeVersion.dirtyTimestamp)
      return {
        versionString,
        dirtyTimestamp: treeVersion.dirtyTimestamp,
        dependencyVersions: {},
      }
    }

    const namedDependencyVersions = await Bluebird.map(
      dependencies,
      async (m: ModuleConfig) => ({ name: m.name, ...await this.resolveTreeVersion(m.path) }),
    )
    const dependencyVersions = mapValues(keyBy(namedDependencyVersions, "name"), v => omit(v, "name"))

    // keep the module at the top of the chain, dependencies sorted by name
    const allVersions: NamedTreeVersion[] = [{ name: moduleConfig.name, ...treeVersion }]
      .concat(namedDependencyVersions)
    const dirtyTimestamp = getLatestDirty(allVersions)

    return {
      dirtyTimestamp,
      dependencyVersions,
      versionString: getVersionString(moduleConfig, allVersions, dirtyTimestamp),
    }
  }

  getRemoteSourcesDirname(type: ExternalSourceType) {
    return getRemoteSourcesDirname(type)
  }

  getRemoteSourcePath(name, url, sourceType) {
    return getRemoteSourcePath({ name, url, sourceType })
  }
}

async function readVersionFile(path: string, schema): Promise<any> {
  if (!(await pathExists(path))) {
    return null
  }

  // this is used internally to specify version outside of source control
  const versionFileContents = (await readFile(path)).toString().trim()

  if (!versionFileContents) {
    return null
  }

  try {
    return validate(JSON.parse(versionFileContents), schema)
  } catch (error) {
    throw new ConfigurationError(
      `Unable to parse ${path} as valid version file`,
      {
        path,
        versionFileContents,
        error,
      },
    )
  }
}

export async function readTreeVersionFile(path: string): Promise<TreeVersion | null> {
  return readVersionFile(path, treeVersionSchema)
}

export async function writeTreeVersionFile(path: string, version: TreeVersion) {
  await writeFile(path, JSON.stringify(version))
}

export async function readModuleVersionFile(path: string): Promise<ModuleVersion | null> {
  return readVersionFile(path, moduleVersionSchema)
}

export async function writeModuleVersionFile(path: string, version: ModuleVersion) {
  await writeFile(path, JSON.stringify(version))
}

/**
 * We prefix with "v-" to prevent this.version from being read as a number when only a prefix of the
 * commit hash is used, and that prefix consists of only numbers. This can cause errors in certain contexts
 * when the version string is used in template variables in configuration files.
 */
export function getVersionString(
  moduleConfig: ModuleConfig, treeVersions: NamedTreeVersion[], dirtyTimestamp: number | null,
) {
  const hashed = `v-${hashVersions(moduleConfig, treeVersions)}`
  return dirtyTimestamp ? `${hashed}-${dirtyTimestamp}` : hashed
}

/**
 * Returns the latest (i.e. numerically largest) dirty timestamp found in versions, or null if none of versions
 * has a dirty timestamp.
 */
export function getLatestDirty(versions: TreeVersion[]): number | null {
  const latest = last(sortBy(
    versions.filter(v => !!v.dirtyTimestamp), v => v.dirtyTimestamp)
    .map(v => v.dirtyTimestamp))
  return latest || null
}

/**
 * The versions argument should consist of moduleConfig's tree version, and the tree versions of its dependencies.
 */
export function hashVersions(moduleConfig: ModuleConfig, versions: NamedTreeVersion[]) {
  const versionHash = createHash("sha256")
  const configString = serializeConfig(moduleConfig)
  const versionStrings = sortBy(versions, "name")
    .map(v => `${v.name}_${v.latestCommit}`)
  versionHash.update([configString, ...versionStrings].join("."))
  return versionHash.digest("hex").slice(0, 10)
}
