import * as execa from "execa"
import * as Bluebird from "bluebird"
import { remove } from "fs-extra"
import { get, intersection } from "lodash"
import { resolve } from "path"
import { GARDEN_DIR_NAME } from "../src/constants"
import { KubeApi } from "../src/plugins/kubernetes/api"
import { TaskLogStatus, LogEntry } from "../src/logger/log-entry"
import { deleteNamespaces } from "../src/plugins/kubernetes/namespace"
import { JsonLogEntry } from "../src/logger/writers/json-terminal-writer"
import { getAllNamespaces } from "../src/plugins/kubernetes/namespace"
import { getExampleProjects } from "./helpers"
import { WatchTestConditionState } from "./run-garden"
import { systemNamespace, systemMetadataNamespace } from "../src/plugins/kubernetes/system"

export async function removeExampleDotGardenDirs() {
  await Bluebird.map(Object.values(getExampleProjects()), (projectRoot) => {
    return remove(resolve(projectRoot, GARDEN_DIR_NAME))
  })
}

export async function deleteExampleNamespaces(log: LogEntry, includeSystemNamespaces = false) {
  const namespacesToDelete: string[] = []

  const exampleProjectNames = Object.keys(getExampleProjects())

  for (const exampleProjectName of exampleProjectNames) {
    namespacesToDelete.push(exampleProjectName, `${exampleProjectName}--metadata`)
  }

  if (includeSystemNamespaces) {
    namespacesToDelete.push(systemNamespace, systemMetadataNamespace)
  }

  // TODO: Accept context parameter in integ script.
  const api = await KubeApi.factory(log, "docker-for-desktop")
  const existingNamespaces = await getAllNamespaces(api)
  await deleteNamespaces(intersection(existingNamespaces, namespacesToDelete), api)

}

export async function touchFile(path: string): Promise<void> {
  await execa("touch", [path])
}

export function parseLogEntries(entries: string[]): JsonLogEntry[] {
  return entries.filter(Boolean).map((line) => {
    return JSON.parse(line)
  })
}

/**
 * For use with the GardenWatch class.
 */
export function searchLog(entries: JsonLogEntry[], regex: RegExp): WatchTestConditionState {
  const found = !!entries.find(e => !!e.msg.match(regex))
  return found ? "passed" : "waiting"
}

/**
 * Indices of the log entries in a JsonLogEntry[] that correspond to a given task starting, completing or erroring.
 */
export type TaskLogEntryResult = {
  startedIndex: number | null,
  completedIndex: number | null,
  errorIndex: number | null,
  executionTimeMs?: number,
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
    if (!taskIds.find(id => id === taskId)) {
      taskIds.push(taskId)
    }
  }

  return taskIds.map((taskId) => {

    const matchesForKey = matching.filter(m => m.entry.metadata!.task!.uid === taskId)

    const startedMatch = matchesForKey.find(m => m.entry.metadata!.task!.status === "active")
    const errorMatch = matchesForKey.find(m => m.entry.metadata!.task!.status === "error")
    const completedMatch = matchesForKey.find(m => m.entry.metadata!.task!.status === "success")

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
  const index = entries.findIndex(e => matchTask(e, key, status))
  return index === -1 ? null : index
}

export type FilteredTasks = { entry: JsonLogEntry, index: number }[]

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
