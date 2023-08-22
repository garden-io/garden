/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { posix, resolve } from "path"
import { GenerateFileSpec, ModuleConfig } from "../config/module"
import pathIsInside from "path-is-inside"
import { groupBy, intersection } from "lodash"
import chalk from "chalk"
import { naturalList } from "./string"
import dedent from "dedent"
import { InternalError } from "../exceptions"

export const moduleOverlapTypes = ["path", "generateFiles"] as const
export type ModuleOverlapType = (typeof moduleOverlapTypes)[number]

/**
 * Data structure to describe overlapping modules.
 */
export interface ModuleOverlap {
  config: ModuleConfig
  overlaps: ModuleConfig[]
  type: ModuleOverlapType
  generateFilesOverlaps?: string[]
}

interface ModuleOverlapFinderParams {
  leftConfig: ModuleConfig
  rightConfig: ModuleConfig
  projectRoot: string
  gardenDirPath: string
}

// Here `type` and `overlap` can be undefined if no overlap found
interface ModuleOverlapFinderResult {
  pivot: ModuleConfig
  overlap: ModuleConfig | undefined
  type: ModuleOverlapType | undefined
  generateFilesOverlaps?: string[]
}

// The implementation must a commutative function
type ModuleOverlapMatcher = (params: ModuleOverlapFinderParams) => ModuleOverlapFinderResult

const hasInclude = (m: ModuleConfig) => !!m.include
const hasExclude = (m: ModuleConfig) => !!m.exclude

const isModulePathOverlap: ModuleOverlapMatcher = ({
  leftConfig,
  rightConfig,
  projectRoot,
  gardenDirPath,
}: ModuleOverlapFinderParams) => {
  // Do not compare module against itself
  if (leftConfig.name === rightConfig.name) {
    return { pivot: leftConfig, overlap: undefined, type: undefined }
  }

  const leftIsOverlapSafe = hasInclude(leftConfig) || hasExclude(leftConfig)
  const rightIsOverlapSafe = hasInclude(rightConfig) || hasExclude(rightConfig)
  if (leftIsOverlapSafe && rightIsOverlapSafe) {
    return { pivot: leftConfig, overlap: undefined, type: undefined }
  }

  // Here only one or none of 2 configs can have 'include'/'exclude' files defined.
  // Let's re-assign the values if necessary to ensure commutativity of the function.
  let leftResolved = leftConfig
  let rightResolved = rightConfig

  // Let's always use the config without 'include'/'exclude' files as a left argument.
  if (leftIsOverlapSafe) {
    leftResolved = rightConfig
    rightResolved = leftConfig
  }

  if (
    // Don't consider overlap between modules in root and those in the .garden directory
    pathIsInside(rightResolved.path, leftResolved.path) &&
    !(leftResolved.path === projectRoot && pathIsInside(rightResolved.path, gardenDirPath))
  ) {
    return { pivot: leftResolved, overlap: rightResolved, type: "path" }
  }
  return { pivot: leftConfig, overlap: undefined, type: undefined }
}

const isGenerateFilesOverlap: ModuleOverlapMatcher = ({ leftConfig, rightConfig }: ModuleOverlapFinderParams) => {
  // Do not compare module against itself
  if (leftConfig.name === rightConfig.name) {
    return { pivot: leftConfig, overlap: undefined, type: undefined }
  }

  const leftGenerateFiles = leftConfig.generateFiles || []
  const rightGenerateFiles = rightConfig.generateFiles || []
  // Nothing to return if the current module has no `generateFiles` defined
  if (leftGenerateFiles.length === 0 || rightGenerateFiles.length === 0) {
    return { pivot: leftConfig, overlap: undefined, type: undefined }
  }

  const leftTargetPaths = resolveGenerateFilesTargetPaths(leftConfig.path, leftGenerateFiles)
  const rightTargetPaths = resolveGenerateFilesTargetPaths(rightConfig.path, rightGenerateFiles)
  const generateFilesOverlaps = intersection(leftTargetPaths, rightTargetPaths)

  if (generateFilesOverlaps.length === 0) {
    return { pivot: leftConfig, overlap: undefined, type: undefined }
  }

  return { pivot: leftConfig, overlap: rightConfig, type: "generateFiles", generateFilesOverlaps }
}

const moduleOverlapMatchers: ModuleOverlapMatcher[] = [isModulePathOverlap, isGenerateFilesOverlap]

const moduleNameComparator = (a, b) => (a.name > b.name ? 1 : -1)

function resolveGenerateFilesTargetPaths(modulePath: string, generateFiles: GenerateFileSpec[]): string[] {
  return generateFiles.map((f) => f.targetPath).map((p) => resolve(modulePath, ...p.split(posix.sep)))
}

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
  const enabledModules = moduleConfigs.filter((m) => !m.disabled).sort(moduleNameComparator)
  if (enabledModules.length < 2) {
    return []
  }

  const foundOverlaps: ModuleOverlap[] = []
  for (let i = 0; i < enabledModules.length; i++) {
    const leftConfig = enabledModules[i]
    for (let j = i + 1; j < enabledModules.length; j++) {
      const rightConfig = enabledModules[j]
      for (const moduleOverlapMatcher of moduleOverlapMatchers) {
        const { pivot, overlap, type, generateFilesOverlaps } = moduleOverlapMatcher({
          leftConfig,
          rightConfig,
          projectRoot,
          gardenDirPath,
        })
        if (!!overlap) {
          if (!type) {
            throw new InternalError({
              message: "Got some module overlap errors with undefined type. This is a bug, please report it.",
              detail: { config: pivot, overlap },
            })
          }
          foundOverlaps.push({ config: pivot, overlaps: [overlap], type, generateFilesOverlaps })
        }
      }
    }
  }
  return foundOverlaps
}

interface ModuleDesc {
  path: string
  name: string
}

export interface ModuleOverlapDescription {
  module: ModuleDesc
  overlaps: ModuleDesc[]
}

export interface OverlapErrorDescription {
  detail: { overlappingModules: ModuleOverlapDescription[] }
  message: string
}

type ModuleOverlapRenderer = (projectRoot: string, moduleOverlaps: ModuleOverlap[]) => OverlapErrorDescription

function sanitizeErrorDetails(projectRoot: string, moduleOverlaps: ModuleOverlap[]): ModuleOverlapDescription[] {
  return moduleOverlaps.map(({ config, overlaps }) => {
    return {
      module: { name: config.name, path: resolve(projectRoot, config.path) },
      overlaps: overlaps.map(({ name, path }) => ({ name, path: resolve(projectRoot, path) })),
    }
  })
}

const makePathOverlapError: ModuleOverlapRenderer = (
  projectRoot: string,
  moduleOverlaps: ModuleOverlap[]
): OverlapErrorDescription => {
  const overlapList = moduleOverlaps.map(({ config, overlaps }) => {
    const formatted = overlaps.map((o) => {
      const detail = o.path === config.path ? "same path" : "nested"
      return `${chalk.bold(o.name)} (${detail})`
    })
    return `Module ${chalk.bold(config.name)} overlaps with module(s) ${naturalList(formatted)}.`
  })
  const message = chalk.red(dedent`
      Found multiple enabled modules that share the same garden.yml file or are nested within another:

      ${overlapList.join("\n\n")}

      If this was intentional, there are two options to resolve this error:

      - You can add ${chalk.bold("include")} and/or ${chalk.bold("exclude")} directives on the affected modules.
        By explicitly including / excluding files, the modules are actually allowed to overlap in case that is
        what you want.
      - You can use the ${chalk.bold("disabled")} directive to make sure that only one of the modules is enabled
        at any given time. For example, you can make sure that the modules are enabled only in a certain
        environment.
    `)
  const overlappingModules = sanitizeErrorDetails(projectRoot, moduleOverlaps)
  return { message, detail: { overlappingModules } }
}

const makeGenerateFilesOverlapError: ModuleOverlapRenderer = (
  projectRoot: string,
  moduleOverlaps: ModuleOverlap[]
): OverlapErrorDescription => {
  const moduleOverlapList = moduleOverlaps.map(({ config, overlaps, generateFilesOverlaps }) => {
    const formatted = overlaps.map((o) => {
      return `${chalk.bold(o.name)}`
    })
    return `Module ${chalk.bold(config.name)} overlaps with module(s) ${naturalList(formatted)} in ${naturalList(
      generateFilesOverlaps || []
    )}.`
  })
  const message = chalk.red(dedent`
      Found multiple enabled modules that share the same value(s) in ${chalk.bold("generateFiles[].targetPath")}:

      ${moduleOverlapList.join("\n\n")}
    `)
  const overlappingModules = sanitizeErrorDetails(projectRoot, moduleOverlaps)
  return {
    message,
    detail: { overlappingModules },
  }
}

// This explicit type ensures that every `ModuleOverlapType` has a defined renderer
const moduleOverlapRenderers: { [k in ModuleOverlapType]: ModuleOverlapRenderer } = {
  path: makePathOverlapError,
  generateFiles: makeGenerateFilesOverlapError,
}

export function makeOverlapErrors(projectRoot: string, moduleOverlaps: ModuleOverlap[]): OverlapErrorDescription[] {
  return Object.entries(groupBy(moduleOverlaps, "type")).map(([type, overlaps]) => {
    const moduleOverlapType = type as ModuleOverlapType
    const renderer = moduleOverlapRenderers[moduleOverlapType]
    return renderer(projectRoot, overlaps)
  })
}
