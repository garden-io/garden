/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { keyBy } from "lodash-es"

import type { LinkedSource } from "../config-store/local.js"
import { ParameterError } from "../exceptions.js"
import type { GardenModule } from "../types/module.js"
import type { Garden } from "../garden.js"
import { hashString } from "./util.js"
import { naturalList, titleize } from "./string.js"
import { join } from "path"
import { styles } from "../logger/styles.js"

export type ExternalSourceType = "project" | "module" | "action"

/**
 * A remote source dir name has the format 'source-name--HASH_OF_REPO_URL'
 * so that we can detect if the repo url has changed
 */
export function getRemoteSourceDirname({ name, url }: { name: string; url: string }) {
  return name + "--" + hashRepoUrl(url)
}

/**
 * Return the absolute path to the directory where remote sources are cloned to, for the given source type.
 */
export function getRemoteSourcesPath({ type, gardenDirPath }: { type: ExternalSourceType; gardenDirPath: string }) {
  return join(gardenDirPath, "sources", type)
}

/**
 * Return the absolute local path of the given remote source, i.e. where it should be cloned to.
 */
export function getRemoteSourceLocalPath(params: {
  name: string
  url: string
  type: ExternalSourceType
  gardenDirPath: string
}) {
  return join(getRemoteSourcesPath(params), getRemoteSourceDirname(params))
}

export function hashRepoUrl(url: string) {
  return hashString(url, 10)
}

export function moduleHasRemoteSource(module: GardenModule): boolean {
  return !!module.repositoryUrl
}

export function getConfigKey(type: ExternalSourceType) {
  if (type === "project") {
    return "linkedProjectSources"
  } else if (type === "action") {
    return "linkedActionSources"
  } else {
    return "linkedModuleSources"
  }
}

/**
 * Returns an array of linked sources by type, as read from the local config store.
 * Returns all linked sources if typed not specified.
 */
export async function getLinkedSources(garden: Garden, type?: ExternalSourceType): Promise<LinkedSource[]> {
  const localConfig = await garden.localConfigStore.get()
  const linkedActionSources = Object.values(localConfig.linkedActionSources)
  const linkedModuleSources = Object.values(localConfig.linkedModuleSources)
  const linkedProjectSources = Object.values(localConfig.linkedProjectSources)
  if (type === "module") {
    return linkedModuleSources
  } else if (type === "project") {
    return linkedProjectSources
  } else if (type === "action") {
    return linkedActionSources
  } else {
    return [...linkedActionSources, ...linkedModuleSources, ...linkedProjectSources]
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
  const linked = keyBy([...(await getLinkedSources(garden, sourceType)), ...sources], "name")
  await garden.localConfigStore.set(getConfigKey(sourceType), linked)
  return Object.values(linked)
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
      const msgType = sourceType === "project" ? "source" : titleize(sourceType)
      const msg = `${titleize(msgType)} ${styles.underline(name)} is not linked. Did you mean to unlink a ${msgType}?`
      throw new ParameterError({
        message: `${msg}${currentNames.length ? ` Currently linked: ${naturalList(currentNames)}` : ""}`,
      })
    }
  }

  const linked = currentlyLinked.filter(({ name }) => !names.includes(name))
  await garden.localConfigStore.set(getConfigKey(sourceType), keyBy(linked, "name"))
  return linked
}
