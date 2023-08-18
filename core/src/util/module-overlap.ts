/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { posix, resolve } from "path"
import { ModuleConfig, ModuleFileSpec } from "../config/module"
import pathIsInside from "path-is-inside"
import { intersection } from "lodash"

export const moduleOverlapTypes = ["path", "generateFiles"] as const
export type ModuleOverlapType = typeof moduleOverlapTypes[number]

/**
 * Data structure to describe overlapping modules.
 */
export interface ModuleOverlap {
  module: ModuleConfig
  overlaps: ModuleConfig[]
  type?: ModuleOverlapType
}

type ModuleOverlapFinder = (c: ModuleConfig) => { matches: ModuleConfig[]; type?: ModuleOverlapType }

/**
 * Returns a list of overlapping modules.
 *
 * If a module does not set `include` or `exclude`, and another module is in its path (including
 * when the other module has the same path), the module overlaps with the other module.
 *
 * If two modules have `generateFiles`, and at least one `generateFiles.targetPath` is the same in both modules,
 * then the modules overlap.
 */
export function detectModuleOverlap({
  projectRoot,
  gardenDirPath,
  moduleConfigs,
}: {
  projectRoot: string
  gardenDirPath: string
  moduleConfigs: ModuleConfig[]
}): ModuleOverlap[] {
  // Don't consider overlap between disabled modules, or where one of the modules is disabled
  const enabledModules = moduleConfigs.filter((m) => !m.disabled)

  const moduleNameComparator = (a, b) => (a.name > b.name ? 1 : -1)

  const findModulePathOverlaps: ModuleOverlapFinder = (config: ModuleConfig) => {
    if (!!config.include || !!config.exclude) {
      return { matches: [] }
    }
    const matches = enabledModules
      .filter(
        (compare) =>
          config.name !== compare.name &&
          // Don't consider overlap between modules in root and those in the .garden directory
          pathIsInside(compare.path, config.path) &&
          !(config.path === projectRoot && pathIsInside(compare.path, gardenDirPath))
      )
      .sort(moduleNameComparator)
    return { matches, type: "path" }
  }

  const findGenerateFilesOverlaps: ModuleOverlapFinder = (config: ModuleConfig) => {
    // Nothing to return if the current module has no `generateFiles` defined.
    if (!config.generateFiles) {
      return { matches: [] }
    }

    function resolveTargetPaths(modulePath: string, generateFiles: ModuleFileSpec[]): string[] {
      return generateFiles.map((f) => f.targetPath).map((p) => resolve(modulePath, ...p.split(posix.sep)))
    }

    const targetPaths = resolveTargetPaths(config.path, config.generateFiles)
    const targetPathsOverlap = (compare: ModuleConfig) => {
      // Skip the modules without `generateFiles`.
      if (!compare.generateFiles) {
        return false
      }
      const compareTargetPaths = resolveTargetPaths(compare.path, compare.generateFiles)
      const overlappingTargetPaths = intersection(targetPaths, compareTargetPaths)
      return overlappingTargetPaths.length > 0
    }
    const matches = enabledModules.filter(targetPathsOverlap).sort(moduleNameComparator)
    return { matches, type: "generateFiles" }
  }

  const moduleOverlapFinders: ModuleOverlapFinder[] = [findModulePathOverlaps, findGenerateFilesOverlaps]
  let overlaps: ModuleOverlap[] = []
  for (const config of enabledModules) {
    for (const moduleOverlapFinder of moduleOverlapFinders) {
      const { matches, type } = moduleOverlapFinder(config)
      if (matches.length > 0) {
        overlaps.push({
          module: config,
          overlaps: matches,
          type,
        })
      }
    }
  }
  return overlaps
}
