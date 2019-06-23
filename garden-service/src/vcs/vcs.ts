/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import { mapValues, keyBy, sortBy, omit } from "lodash"
import { createHash } from "crypto"
import { validate, joiArray, joi } from "../config/common"
import { join } from "path"
import { GARDEN_VERSIONFILE_NAME } from "../constants"
import { pathExists, readFile, writeFile } from "fs-extra"
import { ConfigurationError } from "../exceptions"
import { ExternalSourceType, getRemoteSourcesDirname, getRemoteSourceRelPath } from "../util/ext-source-util"
import { ModuleConfig, serializeConfig } from "../config/module"
import { LogNode } from "../logger/log-node"

export const NEW_MODULE_VERSION = "0000000000"

export interface TreeVersion {
  contentHash: string
  files: string[]
}

export interface TreeVersions { [moduleName: string]: TreeVersion }

export interface ModuleVersion {
  versionString: string
  dependencyVersions: TreeVersions
  files: string[]
}

interface NamedTreeVersion extends TreeVersion {
  name: string
}

const versionStringSchema = joi.string()
  .regex(/^v/)
  .required()
  .description("String representation of the module version.")

const fileNamesSchema = joiArray(joi.string())
  .description("List of file paths included in the version.")

export const treeVersionSchema = joi.object()
  .keys({
    contentHash: joi.string()
      .required()
      .description("The hash of all files in the directory, after filtering."),
    files: fileNamesSchema,
  })

export const moduleVersionSchema = joi.object()
  .keys({
    versionString: versionStringSchema,
    dependencyVersions: joi.object()
      .pattern(/.+/, treeVersionSchema)
      .default(() => ({}), "{}")
      .description("The version of each of the dependencies of the module."),
    files: fileNamesSchema,
  })

export interface RemoteSourceParams {
  url: string,
  name: string,
  sourceType: ExternalSourceType,
  log: LogNode,
}

export interface VcsFile {
  path: string
  hash: string
}

export abstract class VcsHandler {
  constructor(protected gardenDirPath: string) { }

  abstract name: string
  abstract async getFiles(path: string, include?: string[]): Promise<VcsFile[]>
  abstract async ensureRemoteSource(params: RemoteSourceParams): Promise<string>
  abstract async updateRemoteSource(params: RemoteSourceParams): Promise<void>

  // Note: explicitly requiring the include variable or null, to make sure it's specified
  async getTreeVersion(path: string, include: string[] | null): Promise<TreeVersion> {
    const files = await this.getFiles(path, include || undefined)
    const contentHash = files.length > 0 ? hashFileHashes(files.map(f => f.hash)) : NEW_MODULE_VERSION
    return { contentHash, files: files.map(f => f.path) }
  }

  async resolveTreeVersion(path: string, include: string[] | null): Promise<TreeVersion> {
    // the version file is used internally to specify versions outside of source control
    const versionFilePath = join(path, GARDEN_VERSIONFILE_NAME)
    const fileVersion = await readTreeVersionFile(versionFilePath)
    return fileVersion || this.getTreeVersion(path, include)
  }

  async resolveVersion(moduleConfig: ModuleConfig, dependencies: ModuleConfig[]): Promise<ModuleVersion> {
    const treeVersion = await this.resolveTreeVersion(moduleConfig.path, moduleConfig.include || null)

    validate(treeVersion, treeVersionSchema, {
      context: `${this.name} tree version for module at ${moduleConfig.path}`,
    })

    if (dependencies.length === 0) {
      const versionString = getVersionString(
        moduleConfig,
        [{ ...treeVersion, name: moduleConfig.name }],
      )
      return {
        versionString,
        dependencyVersions: {},
        files: treeVersion.files,
      }
    }

    const namedDependencyVersions = await Bluebird.map(
      dependencies,
      async (m: ModuleConfig) => ({ name: m.name, ...await this.resolveTreeVersion(m.path, m.include || null) }),
    )
    const dependencyVersions = mapValues(keyBy(namedDependencyVersions, "name"), v => omit(v, "name"))

    // keep the module at the top of the chain, dependencies sorted by name
    const allVersions: NamedTreeVersion[] = [{ name: moduleConfig.name, ...treeVersion }]
      .concat(namedDependencyVersions)

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
  getRemoteSourceRelPath(name, url, sourceType) {
    return getRemoteSourceRelPath({ name, url, sourceType })
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
  moduleConfig: ModuleConfig, treeVersions: NamedTreeVersion[],
) {
  return `v-${hashVersions(moduleConfig, treeVersions)}`
}

/**
 * The versions argument should consist of moduleConfig's tree version, and the tree versions of its dependencies.
 */
export function hashVersions(moduleConfig: ModuleConfig, versions: NamedTreeVersion[]) {
  const configString = serializeConfig(moduleConfig)
  const versionStrings = sortBy(versions, "name")
    .map(v => `${v.name}_${v.contentHash}`)
  return hashFileHashes([configString, ...versionStrings])
}

export function hashFileHashes(hashes: string[]) {
  const versionHash = createHash("sha256")
  versionHash.update(hashes.join("."))
  return versionHash.digest("hex").slice(0, 10)
}
