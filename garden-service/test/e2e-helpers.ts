import execa from "execa"
import mlog from "mocha-logger"
import { remove } from "fs-extra"
import { get, intersection, padEnd } from "lodash"
import parseArgs = require("minimist")
import { resolve } from "path"
import { DEFAULT_GARDEN_DIR_NAME } from "../src/constants"
import { TaskLogStatus } from "../src/logger/log-entry"
import { JsonLogEntry } from "../src/logger/writers/json-terminal-writer"
import { getExampleProjects } from "./helpers"
import { WatchTestConditionState } from "./run-garden"
import { systemMetadataNamespace } from "../src/plugins/kubernetes/system"

export const parsedArgs = parseArgs(process.argv.slice(2))

export async function removeExampleDotGardenDir(projectRoot: string) {
  try {
    await remove(resolve(projectRoot, DEFAULT_GARDEN_DIR_NAME))
  } catch (error) {
    // No .garden directory found in projectRoot, so there's nothing to do here.
  }
}

export async function deleteExampleNamespaces(projectNames?: string[]) {
  // TODO: Accept context parameter in e2e script.
  const existingNamespaces = await getAllNamespacesKubectl()
  let namespacesToDelete: string[] = []
  let exampleProjectNames = projectNames || Object.keys(getExampleProjects())

  for (const exampleProjectName of exampleProjectNames) {
    namespacesToDelete.push(exampleProjectName)
    namespacesToDelete.push(...existingNamespaces.filter((n) => n.startsWith(`${exampleProjectName}--`)))
  }
  namespacesToDelete = intersection(namespacesToDelete, existingNamespaces)

  await deleteNamespacesKubectl(namespacesToDelete)
}

export async function deleteSystemMetadataNamespace() {
  await deleteExistingNamespacesKubectl([systemMetadataNamespace])
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

export function parseLogEntries(entries: string[]): JsonLogEntry[] {
  return entries.filter(Boolean).map((line) => {
    // Lines are not always JSON parseable
    try {
      return JSON.parse(line)
    } catch (error) {
      mlog.log("Unable to parse line", line)
      return {}
    }
  })
}

export function stringifyLogEntries(entries: JsonLogEntry[]) {
  return entries.map((e) => `${e.section ? padEnd(e.section, 16) + " -> " : ""}${e.msg}`).join("\n")
}

/**
 * For use with the GardenWatch class.
 */
export function searchLog(entries: JsonLogEntry[], regex: RegExp): WatchTestConditionState {
  const found = !!entries.find((e) => !!e.msg && !!e.msg.match(regex))
  return found ? "passed" : "waiting"
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
