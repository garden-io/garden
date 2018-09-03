/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createHash } from "crypto"
import { uniqBy } from "lodash"
import chalk from "chalk"
import pathIsInside = require("path-is-inside")

import {
  PROJECT_SOURCES_DIR_NAME,
  MODULE_SOURCES_DIR_NAME,
} from "../constants"
import {
  LinkedSource,
  localConfigKeys,
} from "../config-store"
import { ParameterError } from "../exceptions"
import { Module } from "../types/module"
import { PluginContext } from "../plugin-context"
import { join } from "path"

export type ExternalSourceType = "project" | "module"

export function getRemoteSourcesDirname(type: ExternalSourceType): string {
  return type === "project" ? PROJECT_SOURCES_DIR_NAME : MODULE_SOURCES_DIR_NAME
}

/**
 * A remote source dir name has the format 'source-name--HASH_OF_REPO_URL'
 * so that we can detect if the repo url has changed
 */
export function getRemoteSourcePath({ name, url, sourceType }:
  { name: string, url: string, sourceType: ExternalSourceType }) {
  const dirname = name + "--" + hashRepoUrl(url)
  return join(getRemoteSourcesDirname(sourceType), dirname)
}

export function hashRepoUrl(url: string) {
  const urlHash = createHash("sha256")
  urlHash.update(url)
  return urlHash.digest("hex").slice(0, 10)
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
export function isModuleLinked(module: Module, ctx: PluginContext) {
  const isPluginModule = !!module.plugin
  return !pathIsInside(module.path, ctx.projectRoot) && !isPluginModule
}

export async function getLinkedSources(
  ctx: PluginContext,
  type: ExternalSourceType,
): Promise<LinkedSource[]> {
  const localConfig = await ctx.localConfigStore.get()
  return (type === "project"
    ? localConfig.linkedProjectSources
    : localConfig.linkedModuleSources) || []
}

export async function addLinkedSources({ ctx, sourceType, sources }: {
  ctx: PluginContext,
  sourceType: ExternalSourceType,
  sources: LinkedSource[],
}): Promise<LinkedSource[]> {
  const linked = uniqBy([...await getLinkedSources(ctx, sourceType), ...sources], "name")
  await ctx.localConfigStore.set([getConfigKey(sourceType)], linked)
  return linked
}

export async function removeLinkedSources({ ctx, sourceType, names }: {
  ctx: PluginContext,
  sourceType: ExternalSourceType,
  names: string[],
}): Promise<LinkedSource[]> {
  const currentlyLinked = await getLinkedSources(ctx, sourceType)
  const currentNames = currentlyLinked.map(s => s.name)

  for (const name of names) {
    if (!currentNames.includes(name)) {
      const msg = sourceType === "project"
        ? `Source ${chalk.underline(name)} is not linked. Did you mean to unlink a module?`
        : `Module ${chalk.underline(name)} is not linked. Did you mean to unlink a source?`
      const errorKey = sourceType === "project" ? "currentlyLinkedSources" : "currentlyLinkedModules"

      throw new ParameterError(msg, { [errorKey]: currentNames, input: names })
    }
  }

  const linked = currentlyLinked.filter(({ name }) => !names.includes(name))
  await ctx.localConfigStore.set([getConfigKey(sourceType)], linked)
  return linked
}
