/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { execa } from "execa"
import fsExtra from "fs-extra"
const { remove } = fsExtra
import { get, intersection, padEnd } from "lodash-es"
import parseArgs from "minimist"
import { resolve } from "path"
import { DEFAULT_GARDEN_DIR_NAME, GARDEN_CORE_ROOT } from "@garden-io/core/build/src/constants.js"
import type { TaskLogStatus } from "@garden-io/core/build/src/logger/log-entry.js"
import type { JsonLogEntry } from "@garden-io/core/build/src/logger/writers/json-terminal-writer.js"
import type { WatchTestConditionState } from "./run-garden.js"

export const parsedArgs = parseArgs(process.argv.slice(2))
export const projectsDir = resolve(GARDEN_CORE_ROOT, "..", "e2e", "projects")

export async function removeExampleDotGardenDir(projectRoot: string) {
  try {
    await remove(resolve(projectRoot, DEFAULT_GARDEN_DIR_NAME))
  } catch (error) {
    // No .garden directory found in projectRoot, so there's nothing to do here.
  }
}

export async function deleteExampleNamespaces(namespaces: string[]) {
  // TODO: Accept context parameter in e2e script.
  const existingNamespaces = await getAllNamespacesKubectl()
  let namespacesToDelete: string[] = []

  for (const exampleProjectName of namespaces) {
    namespacesToDelete.push(exampleProjectName)
    namespacesToDelete.push(...existingNamespaces.filter((n) => n.startsWith(`${exampleProjectName}--`)))
  }
  namespacesToDelete = intersection(namespacesToDelete, existingNamespaces)

  // Note: we don't wait for the kubectl command to return, since that's basically a fire-and-forget and would cost
  // a lot of time to wait for.
  deleteNamespacesKubectl(namespacesToDelete).catch((err) => {
    // eslint-disable-next-line
    console.error(chalk.red.bold(`Error when cleaning namespaces: ${err.message}`))
  })
}

/*
 * The ...Kubectl suffixes on these two functions' names are tiresome, but they prevent accidental
 * imports of the wrong functions (and these two are usually not the ones that should be used).
 *
 * The implementations here (which use kubetl instead of the JS API) are currently only used in a dev scripting
 * context (not inside the framework proper, and outside of a Garden project).
 */
export async function getAllNamespacesKubectl() {
  const { stdout } = await execa("kubectl", ["get", "ns", "-o", "name"])
  const namespaces = stdout.split("\n").map((n) => n.replace("namespace/", ""))
  return namespaces
}

export async function deleteNamespacesKubectl(namespaces: string[]) {
  if (namespaces.length > 0) {
    await execa("kubectl", ["delete", "--wait=false", "ns", ...namespaces])
  }
}

export async function deleteExistingNamespacesKubectl(namespaces: string[]) {
  // TODO: Accept context parameter in e2e script.
  const existingNamespaces = await getAllNamespacesKubectl()
  await deleteNamespacesKubectl(intersection(existingNamespaces, namespaces))
}

export async function touchFile(path: string): Promise<void> {
  await execa("touch", [path])
}

export function parseLogEntry(line: string): JsonLogEntry {
  if (!line) {
    return { msg: "", timestamp: "", level: "info" }
  }
  // Lines are not always JSON parseable
  try {
    return JSON.parse(line)
  } catch (error) {
    // Unable to parse line, so we assume it's a line from an error message.
    return { msg: chalk.red(line), timestamp: "", level: "info" }
  }
}

/**
 * For use with the GardenWatch class.
 */
export function searchLog(entries: JsonLogEntry[], regex: RegExp): WatchTestConditionState {
  const found = !!entries.find((e) => !!e.msg && !!e.msg.match(regex))
  return found ? "passed" : "waiting"
}

const linePrefix = chalk.gray(" > ")
const sectionDivider = chalk.gray(" → ")

/**
 * Renders the given JSON log entry as a string line.
 */
export function stringifyJsonLog(entry: JsonLogEntry, opts = { error: false }) {
  if (!entry.level) {
    return `${linePrefix}[INVALID] ${JSON.stringify(entry)}`
  }

  const line = entry.section ? `${entry.section}${sectionDivider}${entry.msg}` : entry.msg

  const level = chalk.gray(padEnd(`[${entry.level}] `, 10))

  return (opts.error ? chalk.redBright(linePrefix) : linePrefix) + level + line
}

/**
 * Indices of the log entries in a JsonLogEntry[] that correspond to a given task starting, completing or erroring.
 */
export type TaskLogEntryResult = {
  startedIndex: number | null
  completedIndex: number | null
  errorIndex: number | null
  executionTimeMs?: number
}

/**
 * Searches a log entry array for entries pertaining to tasks with key, optionally filtered the task status
 * indicated by the log entry.
 *
 * An example use would be to search for occurrences of "build.some-module" with the "success" status in the log,
 * and checking that the results array has two elements (indicating that some-module was built twice, which could
 * e.g. indicate that the module was rebuilt when one of its files changed during the execution of a GardenWatch
 * instance).
 */
export function findTasks(entries: JsonLogEntry[], key: string, status?: TaskLogStatus): TaskLogEntryResult[] {
  const matching: FilteredTasks = filterTasks(entries, key, status)

  const taskIds: string[] = [] // List of task ids, ordered by their first appearance in the log.

  for (const match of matching) {
    const taskId = match.entry.metadata!.task!.uid
    if (!taskIds.find((id) => id === taskId)) {
      taskIds.push(taskId)
    }
  }

  return taskIds.map((taskId) => {
    const matchesForKey = matching.filter((m) => m.entry.metadata!.task!.uid === taskId)

    const startedMatch = matchesForKey.find((m) => m.entry.metadata!.task!.status === "active")
    const errorMatch = matchesForKey.find((m) => m.entry.metadata!.task!.status === "error")
    const completedMatch = matchesForKey.find((m) => m.entry.metadata!.task!.status === "success")

    const startedIndex = startedMatch ? startedMatch.index : null
    const errorIndex = errorMatch ? errorMatch.index : null
    const completedIndex = completedMatch ? completedMatch.index : null

    // Include the execution time, if the log entry contains it
    const executionTimeMs = completedMatch ? completedMatch.entry.metadata!.task!.durationMs : undefined

    return { startedIndex, completedIndex, errorIndex, executionTimeMs }
  })
}

/**
 * Returns the index of the matching log entry (in entries), or null if no matching entry was found.
 */
export function findTask(entries: JsonLogEntry[], key: string, status?: TaskLogStatus): number | null {
  const index = entries.findIndex((e) => matchTask(e, key, status))
  return index === -1 ? null : index
}

export type FilteredTasks = { entry: JsonLogEntry; index: number }[]

export function filterTasks(entries: JsonLogEntry[], key: string, status?: TaskLogStatus): FilteredTasks {
  const filtered: FilteredTasks = []
  for (const [index, entry] of entries.entries()) {
    if (matchTask(entry, key, status)) {
      filtered.push({ index, entry })
    }
  }

  return filtered
}

export function matchTask(entry: JsonLogEntry, key: string, status?: TaskLogStatus): boolean {
  const meta = get(entry, ["metadata", "task"])
  return !!meta && meta.key === key && (!status || status === meta.status)
}
