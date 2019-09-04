/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { uniqBy } from "lodash"
import chalk from "chalk"
import pathIsInside = require("path-is-inside")

import { PROJECT_SOURCES_DIR_NAME, MODULE_SOURCES_DIR_NAME } from "../constants"
import { LinkedSource, localConfigKeys } from "../config-store"
import { ParameterError } from "../exceptions"
import { Module } from "../types/module"
import { join } from "path"
import { Garden } from "../garden"
import { hashString } from "./util"

export type ExternalSourceType = "project" | "module"

export function getRemoteSourcesDirname(type: ExternalSourceType): string {
  return type === "project" ? PROJECT_SOURCES_DIR_NAME : MODULE_SOURCES_DIR_NAME
}

/**
 * A remote source dir name has the format 'source-name--HASH_OF_REPO_URL'
 * so that we can detect if the repo url has changed
 */
export function getRemoteSourceRelPath({
  name,
  url,
  sourceType,
}: {
  name: string
  url: string
  sourceType: ExternalSourceType
}) {
  const dirname = name + "--" + hashRepoUrl(url)
  return join(getRemoteSourcesDirname(sourceType), dirname)
}

export function hashRepoUrl(url: string) {
  return hashString(url, 10)
}

export function hasRemoteSource(module: Module): boolean {
  return !!module.repositoryUrl
}
export function getConfigKey(type: ExternalSourceType): string {
  return type === "project" ? localConfigKeys.linkedProjectSources : localConfigKeys.linkedModuleSources
}

/**
 * Check if any module is linked, including those within an external project source.
 * Returns true if module path is not under the project root or alternatively if the module is a Garden module.
 */
export function isModuleLinked(module: Module, garden: Garden) {
  const isPluginModule = !!module.plugin
  return !pathIsInside(module.path, garden.projectRoot) && !isPluginModule
}

/**
 * Returns an array of linked sources by type, as read from the local config store.
 * Returns all linked sources if typed not specified.
 */
export async function getLinkedSources(garden: Garden, type?: ExternalSourceType): Promise<LinkedSource[]> {
  const localConfig = await garden.configStore.get()
  const linkedModuleSources = localConfig.linkedModuleSources || []
  const linkedProjectSources = localConfig.linkedProjectSources || []
  if (type === "module") {
    return linkedModuleSources
  } else if (type === "project") {
    return linkedProjectSources
  } else {
    return [...linkedModuleSources, ...linkedProjectSources]
  }
}

export async function addLinkedSources({
  garden,
  sourceType,
  sources,
}: {
  garden: Garden
  sourceType: ExternalSourceType
  sources: LinkedSource[]
}): Promise<LinkedSource[]> {
  const linked = uniqBy([...(await getLinkedSources(garden, sourceType)), ...sources], "name")
  await garden.configStore.set([getConfigKey(sourceType)], linked)
  return linked
}

export async function removeLinkedSources({
  garden,
  sourceType,
  names,
}: {
  garden: Garden
  sourceType: ExternalSourceType
  names: string[]
}): Promise<LinkedSource[]> {
  const currentlyLinked = await getLinkedSources(garden, sourceType)
  const currentNames = currentlyLinked.map((s) => s.name)

  for (const name of names) {
    if (!currentNames.includes(name)) {
      const msg =
        sourceType === "project"
          ? `Source ${chalk.underline(name)} is not linked. Did you mean to unlink a module?`
          : `Module ${chalk.underline(name)} is not linked. Did you mean to unlink a source?`
      const errorKey = sourceType === "project" ? "currentlyLinkedSources" : "currentlyLinkedModules"

      throw new ParameterError(msg, { [errorKey]: currentNames, input: names })
    }
  }

  const linked = currentlyLinked.filter(({ name }) => !names.includes(name))
  await garden.configStore.set([getConfigKey(sourceType)], linked)
  return linked
}
