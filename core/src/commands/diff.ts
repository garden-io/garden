/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { dedent, indentBlock } from "../util/string.js"
import type { CommandParams } from "./base.js"
import { Command } from "./base.js"
import { printHeader } from "../logger/util.js"
import { BooleanParameter, EnvironmentParameter, StringOption, StringsParameter, TagsOption } from "../cli/params.js"
import tmp from "tmp-promise"
import { GitCli } from "../vcs/git.js"
import { ParameterError } from "../exceptions.js"
import type { ActionReference, DeepPrimitiveMap, StringMap } from "../config/common.js"
import { parseActionReference } from "../config/common.js"
import type { ConfigGraph, RenderedNode } from "../graph/config-graph.js"
import type { ActionDependency, ActionKind, ActionVersion } from "../actions/types.js"
import { actionReferenceToString, replaceExcludeValues, type BaseAction } from "../actions/base.js"
import { Garden } from "../garden.js"
import type { BaseGardenResource } from "../config/base.js"
import { fromPairs, isEqual, keyBy, repeat } from "lodash-es"
import { styles } from "../logger/styles.js"
import type { Log } from "../logger/log-entry.js"
import type { VcsFile } from "../vcs/vcs.js"
import type { ChangeObject } from "diff"
import { diffJson, diffLines } from "diff"
import fsExtra from "fs-extra"
import { deepResolveContext } from "../config/template-contexts/base.js"
import { sanitizeValue } from "../util/logging.js"
import stringWidth from "string-width"
import { relative } from "path"
const { readFile } = fsExtra

// TODO: Break this out into smaller files

const diffArgs = {}

const diffOpts = {
  "commit": new StringOption({
    help: "A commit ID to compare with.",
  }),
  "branch": new StringOption({
    help: "A branch to compare with.",
  }),
  "diff-env": new EnvironmentParameter({
    help: "Override the Garden environment for the comparison.",
  }),
  "diff-local-env": new TagsOption({
    help: 'Override a local environment variable in the comparison (as templated using ${local.env.*}) with the specified value, formatted as <VAR_NAME>:<VALUE>, e.g. "MY_VAR=my-value". You can specify multiple variables by repeating the flag.',
  }),
  "diff-var": new TagsOption({
    help: 'Override a variable in the comparison with the specified value, formatted as <VAR_NAME>:<VALUE>, e.g. "MY_VAR=my-value". Analogous to the --var global flag in the Garden CLI. You can specify multiple variables by repeating the flag.',
  }),
  "resolve": new BooleanParameter({
    help: "Fully resolve each action before comparing. Note that this may result in actions being executed during resolution (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, you may want to avoid this option or use the --action flag to only diff specific actions.",
    defaultValue: false,
  }),
  "action": new StringsParameter({
    help: "Specify an action to diff, as <kind>.<name>. Can be specified multiple times. If none is specified, all actions will be diffed.",
    defaultValue: undefined,
  }),
  // TODO: Support comparing with a directory path
  // TODO: Option to diff source file contents
}

type Args = typeof diffArgs
type Opts = typeof diffOpts

type DiffStatus = "added" | "removed" | "modified" | "unchanged"

interface FileDiff {
  status: DiffStatus
  path: string
  diff?: string // Only present for modified files
}

interface WorkflowDiff {
  status: DiffStatus
  rawConfigDiff: string | null
}

interface ProjectDiff {
  status: "modified" | "unchanged"
  rawConfigDiff: string | null
  resolvedVariablesDiff: string | null
}

// TODO: Would be good to include which action outputs are required by the dependant, when applicable
interface ActionDependencyPathDetail {
  by: ActionReference
  on: ActionDependency
}

interface VersionChange {
  dependency: string
  status: DiffStatus
  versionA: string | null
  versionB: string | null
}

interface AffectedDependantNode {
  key: string
  versionA: ActionVersion | null
  versionB: ActionVersion | null
  dependencyPaths: ActionDependencyPathDetail[][]
}

interface ActionDiffPreliminary {
  status: DiffStatus
  key: string
  kind: ActionKind
  name: string
  versionA: ActionVersion | null
  versionB: ActionVersion | null
  diffDescriptions: string[]
  rawConfigDiff: string | null
  resolvedConfigDiff: string | null
  files: FileDiff[]
}

interface ActionDiff extends ActionDiffPreliminary {
  diffSummary: string
  affectedDependants: AffectedDependantNode[]
}

interface DiffResult {
  projectConfig: ProjectDiff
  workflows: { [key: string]: WorkflowDiff }
  actions: { [key: string]: ActionDiff }
}

export class DiffCommand extends Command<Args, Opts, DiffResult> {
  name = "diff"
  help = "[EXPERIMENTAL] Compare the current working directory Garden project with the specified branch or commit."

  override description = dedent`
    **[EXPERIMENTAL] This command is still under development and may change in the future, including parameters and output format.**

    Compare the current working directory Garden project with the specified branch or commit.

    Use this to understand the impact of your changes on action versions.

    In most cases you should use this with the --resolve flag to ensure that the comparison is complete, but take caution as it may result in actions being executed during resolution (e.g. if a runtime output is referenced by another action, it will be executed in order to fully resolve the config). In such cases, you may want to avoid this option or use the --action flag to only diff specific actions.

    Note that in the output, "A" (e.g. "version A") refers to the current working directory project, and "B" refers to the project at the specified branch or commit. When something is reported as "added" (such as an action, file, new lines in a config etc.), it means it's present in the current project but not in the comparison project. Similarly, "removed" means it's present in the comparison project but not in the current project.
  `

  override arguments = diffArgs

  override options = diffOpts

  override printHeader({ log }) {
    printHeader(log, "Diffing Garden project", "🔍")
  }

  async action({ garden: gardenA, log, args, opts }: CommandParams<Args, Opts>) {
    log.info("")

    let missingDiffParams = true

    let environmentB = `${gardenA.environmentName}.${gardenA.namespace}`
    if (opts["diff-env"]) {
      environmentB = opts["diff-env"]
      log.info({
        msg: "Comparing with environment: " + environmentB,
      })
      missingDiffParams = false
    }

    let localEnvOverrides: StringMap = {}
    if (opts["diff-local-env"]) {
      localEnvOverrides = fromPairs(opts["diff-local-env"].flatMap((group) => group.map((t) => [t.key, t.value])))
      log.info({
        msg:
          "Overriding local environment variables for comparison: " +
          Object.entries(localEnvOverrides)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n - "),
      })
      missingDiffParams = false
    }

    let variableOverrides: StringMap = {}
    if (opts["diff-var"]) {
      variableOverrides = fromPairs(opts["diff-var"].flatMap((group) => group.map((t) => [t.key, t.value])))
      log.info({
        msg:
          "Overriding variables for comparison: " +
          Object.entries(variableOverrides)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n  - "),
      })
      missingDiffParams = false
    }

    if (missingDiffParams && !opts.branch && !opts.commit) {
      throw new ParameterError({
        message:
          "No diff parameters specified. Please specify one or more of --branch, --commit, --diff-env, --diff-local-env, --diff-var.",
      })
    }

    const actionsFilter = opts.action

    if (actionsFilter) {
      // Validate the actions
      actionsFilter.map(parseActionReference)
      log.info({ msg: "Filtering to actions: " + actionsFilter.join(", ") })
    }

    const gitCli = new GitCli({ log, cwd: gardenA.projectRoot })
    const repoRoot = await gitCli.getRepositoryRoot()

    // Check if the reference is a branch
    let commitish: string | null = null
    let projectRootB = gardenA.projectRoot

    if (opts.branch && opts.commit) {
      throw new ParameterError({ message: "Cannot specify both branch and commit" })
    } else if (opts.branch || opts.commit) {
      log.info({ msg: "Fetching repo origin" })

      // Fetch the repo origin
      await gitCli.exec("fetch", "origin")
    }

    if (opts.branch) {
      log.info({ msg: "Comparing with branch " + chalk.white.bold(opts.branch) })
      try {
        await gitCli.exec("show-ref", "--verify", "--quiet", "refs/heads/" + opts.branch)
        commitish = opts.branch
      } catch (e) {
        throw new ParameterError({ message: "Could not find branch " + chalk.white.bold(opts.branch) })
      }
    } else if (opts.commit) {
      log.info({ msg: "Comparing with commit " + chalk.white.bold(opts.commit) })
      try {
        await gitCli.exec("rev-parse", "--verify", opts.commit)
        commitish = opts.commit
      } catch (e) {
        throw new ParameterError({ message: "Could not find commit " + chalk.white.bold(opts.commit) })
      }
    }

    // Clone the project repo into a temporary directory
    if (commitish) {
      log.info({
        msg: "Cloning repo into temporary directory and checking out " + chalk.white.bold(commitish),
      })
      // TODO: ensure cleanup of the temporary directory
      const tmpDir = await tmp.dir({ prefix: "garden-diff-" })
      await gitCli.exec("clone", repoRoot, tmpDir.path)
      projectRootB = tmpDir.path

      const gitCliClone = new GitCli({ log, cwd: tmpDir.path })
      await gitCliClone.exec("checkout", commitish)
    }

    // TODO: Handle remote sources
    // -> Update the remote sources in the current project
    // -> Fetch remote sources in the cloned project

    // Resolve the actions in the current project
    let graphA: ConfigGraph

    if (opts.resolve) {
      graphA = await gardenA.getResolvedConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })
    } else {
      graphA = await gardenA.getConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })
    }

    // Resolve the actions in the temporary project
    const comparisonEnv = opts["diff-env"] || `${gardenA.namespace}.${gardenA.environmentName}`

    const gardenB = await Garden.factory(projectRootB, {
      environmentString: comparisonEnv,
      commandInfo: {
        name: "diff",
        args,
        opts,
        rawArgs: [],
        isCustomCommand: false,
      },
      localEnvOverrides,
      variableOverrides,
      sessionId: gardenA.sessionId,
      parentSessionId: gardenA.parentSessionId,
    })
    let graphB: ConfigGraph

    if (opts.resolve) {
      graphB = await gardenB.getResolvedConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })
    } else {
      graphB = await gardenB.getConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })
    }

    // Compare project configuration
    const projectConfigDiff = await compareProjectConfig(log, gardenA, gardenB)

    // Compare Workflow configurations
    const workflowDiffs: WorkflowDiff[] = await compareWorkflows(log, gardenA, gardenB)

    // Compare module configurations
    // TODO

    const toposortedActions = graphA
      .render()
      .nodes.filter((node) => !actionsFilter || actionsFilter.includes(actionReferenceToString(node)))

    // Compare actions (first pass)
    const actionsPreliminary: ActionDiffPreliminary[] = await Promise.all(
      toposortedActions.map((node) =>
        actionDiffPreliminary({ log, gardenA, gardenB, graphA, graphB, node, resolve: opts.resolve })
      )
    )

    // Handle actions that are removed in the current project
    for (const action of graphB.getActions({ refs: actionsFilter })) {
      if (!graphA.getActions({ refs: [action.reference()] })[0]) {
        // Action is removed in the current project
        actionsPreliminary.push({
          status: "removed",
          key: action.key(),
          kind: action.kind,
          name: action.name,
          versionA: null,
          versionB: action.getFullVersion(log),
          diffDescriptions: [`Action ${chalk.white.bold(action.key())} removed`],
          rawConfigDiff: null,
          resolvedConfigDiff: null,
          files: await computeFiles({ log, gardenA, gardenB, actionA: action, actionB: null }),
        })
      }
    }

    const indexedDiffs = fromPairs(actionsPreliminary.map((diff) => [diff.key, diff]))
    const actions: ActionDiff[] = await Promise.all(
      actionsPreliminary.map((diff) => actionDiffFinal(log, diff, indexedDiffs, graphA))
    )

    const unchangedActions = actions
      .filter((action) => action.status === "unchanged")
      .sort((a, b) => a.key.localeCompare(b.key))

    if (unchangedActions.length > 0) {
      log.info({
        msg: `\n${unchangedActions.length} action(s) unchanged: ${unchangedActions.map((action) => action.key).join(", ")}`,
      })
    }

    log.success("\nDone!")

    return {
      result: {
        projectConfig: projectConfigDiff,
        workflows: keyBy(workflowDiffs, "name"),
        actions: keyBy(actions, "key"),
      },
    }
  }
}

/**
 * ACTIONS
 */
async function actionDiffPreliminary({
  log,
  gardenA,
  gardenB,
  graphA,
  graphB,
  node,
  resolve,
}: {
  log: Log
  gardenA: Garden
  gardenB: Garden
  graphA: ConfigGraph
  graphB: ConfigGraph
  node: RenderedNode
  resolve: boolean
}): Promise<ActionDiffPreliminary> {
  const actionA = graphA.getActionByRef({ kind: node.kind, name: node.name })

  log = actionA.createLog(log)
  log.debug({ msg: "Comparison (phase 1)" })

  const versionA = actionA.getFullVersion(log)
  const actionB = graphB.getActions({ refs: [actionA.reference()] })[0]

  if (!actionB) {
    // Action is added in the current project
    return {
      status: "added",
      key: actionA.key(),
      kind: actionA.kind,
      name: actionA.name,
      versionA: actionA.getFullVersion(log),
      versionB: null,
      diffDescriptions: [`Action ${chalk.white.bold(actionA.key())} added`],
      rawConfigDiff: null,
      resolvedConfigDiff: null,
      files: await computeFiles({ log, gardenA, gardenB, actionA, actionB: null }),
    }
  }

  const versionB = actionB.getFullVersion(log)

  // Version status
  const status = versionA?.versionStringFull === versionB?.versionStringFull ? "unchanged" : "modified"

  const diffDescriptions: string[] = []

  // Raw config
  log.debug({ msg: "Comparing raw configs" })
  const configA = actionA.getConfig()
  const configB = actionB.getConfig()

  const rawConfigDiff = await computeRawConfigDiff(log, configB, configA)
  if (rawConfigDiff) {
    diffDescriptions.push(chalk.underline("Configuration modified directly") + `:\n${indentBlock(rawConfigDiff, 1)}`)
  }

  // Resolved config
  let resolvedConfigDiff: string | null = null

  // Note: It would be possible to resolve configs that don't require any execution, as an enhancement
  if (resolve) {
    log.debug({ msg: "Comparing resolved configs" })
    const projectExcludeValuesA = await gardenA.getExcludeValuesForActionVersions()
    const projectExcludeValuesB = await gardenB.getExcludeValuesForActionVersions()

    const configFilteredA = replaceExcludeValues(configA, actionA.createLog(log), projectExcludeValuesA) as object
    const configFilteredB = replaceExcludeValues(configB, actionB.createLog(log), projectExcludeValuesB) as object
    resolvedConfigDiff = diffObjects(configFilteredB, configFilteredA)

    if (resolvedConfigDiff) {
      diffDescriptions.push(chalk.underline("Resolved configuration changed") + `:\n${resolvedConfigDiff}`)
    }
  }

  // Detect dependency version changes
  log.debug({ msg: "Comparing dependency versions" })
  const versionChanges: VersionChange[] = []
  for (const dep of Object.keys(versionA.dependencyVersions)) {
    const depVersionA = versionA.dependencyVersions[dep]
    const depVersionB = versionB.dependencyVersions[dep]
    if (!depVersionB) {
      versionChanges.push({
        dependency: dep,
        status: "added",
        versionA: depVersionA,
        versionB: null,
      })
    } else if (depVersionA !== depVersionB) {
      versionChanges.push({
        dependency: dep,
        status: "modified",
        versionA: depVersionA,
        versionB: depVersionB,
      })
    }
  }
  for (const dep of Object.keys(versionB.dependencyVersions)) {
    if (!versionA.dependencyVersions[dep]) {
      versionChanges.push({
        dependency: dep,
        status: "removed",
        versionA: null,
        versionB: versionB.dependencyVersions[dep],
      })
    }
  }

  if (versionChanges.length > 0) {
    const versionChangeStr =
      chalk.underline("Dependency version changes:") +
      "\n" +
      versionChanges
        .map((v) => {
          if (v.status === "added") {
            return chalk.green(`+  ${styles.bold(v.dependency)} (${v.versionB})`)
          } else if (v.status === "removed") {
            return chalk.red(`-  ${styles.bold(v.dependency)}`)
          } else {
            return chalk.yellow(`M  ${styles.bold(v.dependency)} (${v.versionA} -> ${v.versionB})`)
          }
        })
        .join("\n")
    diffDescriptions.push(versionChangeStr)
  }

  // Source files
  log.debug({ msg: "Comparing source files" })
  const files = await computeFiles({ log, gardenA, gardenB, actionA, actionB })
  const changedFiles = files.filter((file) => file.status !== "unchanged")

  if (changedFiles.length > 0) {
    diffDescriptions.push(renderFileList(files, changedFiles))
  } else {
    diffDescriptions.push(chalk.gray(`Source files unchanged`))
  }

  return {
    key: actionA.key(),
    kind: actionA.kind,
    name: actionA.name,
    status,
    versionA,
    versionB,
    diffDescriptions,
    rawConfigDiff,
    resolvedConfigDiff,
    files,
  }
}

export async function actionDiffFinal(
  log: Log,
  diff: ActionDiffPreliminary,
  indexedDiffs: Record<string, ActionDiffPreliminary>,
  graphA: ConfigGraph
): Promise<ActionDiff> {
  if (diff.status === "removed" || diff.status === "added") {
    // Action is removed in the current project
    return {
      ...diff,
      diffSummary: diff.diffDescriptions.join("\n"),
      // TODO: Should we populate these for a removed/added action?
      affectedDependants: [],
    }
  }

  const actionA = graphA.getActionByRef({ kind: diff.kind, name: diff.name })
  // const actionB = graphB.getActionByRef({ kind: diffB.kind, name: diffB.name })

  const status = diff.status
  const versionA = diff.versionA
  const versionB = diff.versionB

  let summaryHeading = `Action ${chalk.white.bold(actionA.key())} ${status}`
  if (status === "modified") {
    summaryHeading += ` (${versionA?.versionString} -> ${versionB?.versionString})`
  }

  const diffDescriptions = [summaryHeading, ...diff.diffDescriptions]

  // If the action is modified, we need to compute the modified dependants
  // We should also attempt to highlight possible reasons for the version change
  const affectedDependants: AffectedDependantNode[] = []
  const affectedDependantsDirect: ActionDependencyPathDetail[] = []
  const affectedDependantsTransitive: AffectedDependantNode[] = []

  if (status === "modified") {
    const isModified = (key: string) => indexedDiffs[key]?.status === "modified"

    // Work out the modified dependants
    const dependantsRecursive = graphA.getDependants({ ...actionA.reference(), recursive: true })
    const modifiedDependantsRecursive = dependantsRecursive.filter((d) => isModified(d.key()))

    for (const dependant of modifiedDependantsRecursive) {
      const paths = graphA
        .findDependencyPaths(dependant.reference(), actionA.reference())
        // We want to present this in terms of downstream effects, so we reverse the path
        .map((path) => path.reverse())

      const dependencyPaths: ActionDependencyPathDetail[][] = []

      let directDependency: ActionDependencyPathDetail | null = null

      for (const path of paths) {
        // Check if each link (A->B) in the path is affecting the action. Either:
        // -> Version A is in B's dependencyVersions
        // -> B references outputs from A

        const pathWithDetail: ActionDependencyPathDetail[] = []
        let isAffected = true

        // Loop over each pair (A->B, B->C, ...)in the path and check if the condition is met
        for (let i = 0; i < path.length - 1; i++) {
          const X = path[i]
          const Y = path[i + 1]

          const versionY = Y.getFullVersion(log)
          // Note: This accounts for version.excludeDependencies
          const isInVersion = !!versionY.dependencyVersions[X.key()]

          const dep = Y.getDependencyReference(X.reference())

          if (!dep) {
            log.warn({
              msg: `Dependency ${Y.key()} for action ${X.key()} not found`,
            })
            isAffected = false
            break
          }

          // TODO: Would be nice to know if version.excludeFields/Values removes the effect of the outputs
          //       but that's a lot of work to figure out properly.
          if (!isInVersion && !dep.needsStaticOutputs && !dep.needsExecutedOutputs) {
            isAffected = false
            break
          }

          pathWithDetail.push({
            by: Y.reference(),
            on: dep,
          })
        }

        if (isAffected && pathWithDetail.length > 0) {
          if (path.length === 2) {
            directDependency = pathWithDetail[0]
          }

          dependencyPaths.push(pathWithDetail)
        }
      }

      if (dependencyPaths.length > 0) {
        const affectedDependant: AffectedDependantNode = {
          key: dependant.key(),
          versionA: dependant.getFullVersion(log),
          versionB: actionA.getFullVersion(log),
          dependencyPaths,
        }

        if (directDependency) {
          affectedDependantsDirect.push(directDependency)
        } else {
          affectedDependantsTransitive.push(affectedDependant)
        }

        affectedDependants.push(affectedDependant)
      }
    }
  }

  if (affectedDependants.length > 0) {
    diffDescriptions.push(
      `${affectedDependants.length} dependant(s) affected by modification (${affectedDependantsDirect.length} directly, ${affectedDependants.length - affectedDependantsDirect.length} transitively)`
    )
  } else {
    diffDescriptions.push(chalk.gray(`${affectedDependants.length} dependants affected by modification`))
  }

  if (affectedDependantsDirect.length > 0) {
    // TODO: Add more detail about the direct dependency
    diffDescriptions.push(
      chalk.underline("Directly affected dependants") +
        ":\n" +
        affectedDependantsDirect.map((d) => describeActionDependencyDetail(d)).join("\n")
    )
  }

  if (affectedDependantsTransitive.length > 0) {
    diffDescriptions.push(
      chalk.underline("Transitively affected dependants") +
        `:\n${affectedDependantsTransitive.map((d) => describeActionDependencyPaths(d)).join("\n")}`
    )
  }

  // Summarize
  let diffSummary = chalk.cyanBright(summaryHeading)
  const separatorBar = getSeparatorBar(stringWidth(summaryHeading))

  if (diffDescriptions.length > 1) {
    const blocks = diffDescriptions.slice(1).map((d) => "→ " + indentBlock(d, 2).trimStart())
    diffSummary += `\n${separatorBar}\n${blocks.join("\n\n")}\n${separatorBar}`
  }

  if (status !== "unchanged") {
    log.info({
      msg: "\n" + diffSummary,
    })
  }

  return {
    ...diff,
    diffDescriptions,
    diffSummary,
    affectedDependants,
  }
}

function renderFileList(files: FileDiff[], changedFiles: FileDiff[]): string {
  const fileList = changedFiles.map((file) => {
    let color = chalk.white
    let marker = "="

    if (file.status === "added") {
      color = chalk.green
      marker = "+"
    } else if (file.status === "removed") {
      color = chalk.red
      marker = "-"
    } else if (file.status === "modified") {
      color = chalk.yellow
      marker = "M"
    }

    return color(`${marker} ${file.path}`)
  })
  let detail = chalk.underline("Source files changed") + `:\n${fileList.join("\n")}`

  if (files.length > changedFiles.length) {
    detail += `\n${chalk.gray(`${files.length - changedFiles.length} files unchanged`)}`
  }

  return detail
}

async function computeFiles({
  log,
  gardenA,
  gardenB,
  actionA,
  actionB,
}: {
  log: Log
  gardenA: Garden
  gardenB: Garden
  actionA: BaseAction | null
  actionB: BaseAction | null
}): Promise<FileDiff[]> {
  if (!actionA || !actionB) {
    return []
  }

  let filesA: VcsFile[] = []
  let filesB: VcsFile[] = []

  if (actionA) {
    const sourcePath = actionA.sourcePath()
    filesA = await gardenA.vcs.getFiles({
      log,
      path: sourcePath,
      // FIXME: We should use the minimal roots, as when resolving the graph
      scanRoot: sourcePath,
    })
    filesA = filesA.map((file) => ({
      ...file,
      path: relative(sourcePath, file.path),
    }))
  }

  if (actionB) {
    const sourcePath = actionB.sourcePath()
    filesB = await gardenB.vcs.getFiles({
      log,
      path: sourcePath,
      // FIXME: We should use the minimal roots, as when resolving the graph
      scanRoot: sourcePath,
    })
    filesB = filesB.map((file) => ({
      ...file,
      path: relative(sourcePath, file.path),
    }))
  }

  const filesAByPath = fromPairs(filesA.map((file) => [file.path, file]))
  const filesBByPath = fromPairs(filesB.map((file) => [file.path, file]))

  const files: FileDiff[] = []

  for (const file of filesA) {
    const fileB = filesBByPath[file.path]
    if (fileB) {
      if (fileB.hash !== file.hash) {
        // TODO: Maybe include the diff in the output?
        files.push({
          status: "modified",
          path: file.path,
        })
      } else {
        files.push({
          status: "unchanged",
          path: file.path,
        })
      }
    } else {
      files.push({
        status: "added",
        path: file.path,
      })
    }
  }

  for (const file of filesB) {
    if (!filesAByPath[file.path]) {
      files.push({
        status: "removed",
        path: file.path,
      })
    }
  }

  return files
}

function describeActionDependencyDetail(dependency: ActionDependencyPathDetail): string {
  const ref = `${actionReferenceToString(dependency.by)}`
  const detail: string[] = []

  if (dependency.on.explicit) {
    detail.push("explicit")
  }

  if (dependency.on.needsStaticOutputs || dependency.on.needsExecutedOutputs) {
    detail.push("outputs")
  }

  if (detail.length > 0) {
    return `${styles.bold(ref)} (${detail.join("+")})`
  } else {
    return styles.bold(ref)
  }
}

function describeActionDependencyPaths(dependency: AffectedDependantNode): string {
  // Pick the shortest path
  const shortestPath = dependency.dependencyPaths.sort((a, b) => a.length - b.length)[0]

  if (!shortestPath) {
    return ""
  }

  const nodes = [
    styles.bold(actionReferenceToString(shortestPath[0].on)),
    ...shortestPath.map((d) => describeActionDependencyDetail(d)),
  ]

  let output = nodes.join(" -> ")

  if (dependency.dependencyPaths.length > 1) {
    output += ` [+${dependency.dependencyPaths.length - 1} paths]`
  }

  return output
}

/**
 * PROJECT CONFIG
 */
async function compareProjectConfig(log: Log, gardenA: Garden, gardenB: Garden) {
  log.info({
    msg: styles.highlight(`\n${getSeparatorBar()}\nProject configuration\n${getSeparatorBar()}`),
  })

  const projectConfigA = gardenA.getProjectConfig()
  const projectConfigB = gardenB.getProjectConfig()

  const projectRawConfigDiff = await computeRawConfigDiff(log, projectConfigB, projectConfigA)

  const projectConfigDiff: ProjectDiff = {
    status: projectRawConfigDiff === null ? "unchanged" : "modified",
    rawConfigDiff: projectRawConfigDiff,
    resolvedVariablesDiff: null,
  }

  if (projectRawConfigDiff) {
    log.info({
      msg: chalk.underline("Configuration file modified directly") + `:\n${projectRawConfigDiff}`,
    })
  } else {
    log.info({
      msg: chalk.gray("Configuration file unchanged"),
    })
  }

  // Compare resolved project variables
  const variablesA = deepResolveContext("project variables A", gardenA.variables) as DeepPrimitiveMap
  const variablesB = deepResolveContext("project variables B", gardenB.variables) as DeepPrimitiveMap

  const variablesDiff = diffObjects(variablesB, variablesA)

  if (variablesDiff) {
    log.info({
      msg: chalk.underline("Resolved project variables modified") + `:\n${variablesDiff}`,
    })
    projectConfigDiff.resolvedVariablesDiff = variablesDiff
  }

  log.info({
    msg: getSeparatorBar(),
  })

  return projectConfigDiff
}

/**
 * WORKFLOWS
 */
async function compareWorkflows(log: Log, gardenA: Garden, gardenB: Garden): Promise<WorkflowDiff[]> {
  const workflowConfigsRawA = await gardenA.getRawWorkflowConfigs()
  const workflowConfigsRawB = await gardenB.getRawWorkflowConfigs()

  const workflowDiffs: WorkflowDiff[] = []

  log.info({
    msg: styles.highlight("\nWorkflows\n") + getSeparatorBar(),
  })

  if (workflowConfigsRawA.length === 0 && workflowConfigsRawB.length === 0) {
    log.info({
      msg: chalk.gray("No Workflows found\n") + getSeparatorBar(),
    })
    return []
  }

  log.info(chalk.gray(`${workflowConfigsRawA.length} workflows found`))

  for (const configRawA of workflowConfigsRawA) {
    const configRawB = workflowConfigsRawB.find((w) => w.name === configRawA.name)
    if (!configRawB) {
      workflowDiffs.push({ status: "added", rawConfigDiff: null })
      log.info({
        msg: chalk.bold(`\nWorkflow ${configRawA.name} added`),
      })
      continue
    }

    const rawConfigDiff = await computeRawConfigDiff(log, configRawB, configRawA)

    let status: DiffStatus = "unchanged"

    if (rawConfigDiff) {
      log.info({
        msg:
          "\n" +
          chalk.underline(`Workflow ${styles.highlight(configRawA.name)} configuration file modified directly`) +
          `:\n${indentBlock(rawConfigDiff, 1)}`,
      })
      status = "modified"
    }

    if (status === "unchanged") {
      log.info({
        msg: chalk.gray(`\nWorkflow ${configRawA.name} unchanged`),
      })
    }

    workflowDiffs.push({
      status,
      rawConfigDiff,
    })
  }

  for (const configRawB of workflowConfigsRawB) {
    if (!workflowConfigsRawA.find((w) => w.name === configRawB.name)) {
      workflowDiffs.push({ status: "removed", rawConfigDiff: null })
      log.info({
        msg: chalk.bold(`\nWorkflow ${configRawB.name} removed`),
      })
    }
  }

  log.info({
    msg: getSeparatorBar(),
  })

  return workflowDiffs
}

/**
 * UTILS
 */
async function getRawConfig(log: Log, resource: BaseGardenResource | null): Promise<string | null> {
  if (!resource) {
    return null
  }

  // Using the YAML document when possible to avoid diffing the whole YAML file as opposed to the relevant doc
  if (resource.internal.yamlDoc) {
    return resource.internal.yamlDoc.toString()
  }

  const configPath = resource.internal.configFilePath
  if (!configPath) {
    log.warn({
      msg: chalk.yellow(`No config file path found for resource ${resource.kind}.${resource.name}`),
    })
    return null
  }

  return await readFile(configPath, "utf-8")
}

async function computeRawConfigDiff(
  log: Log,
  configA: BaseGardenResource | null,
  configB: BaseGardenResource | null
): Promise<string | null> {
  const rawDocA = await getRawConfig(log, configA)
  const rawDocB = await getRawConfig(log, configB)

  if (!rawDocA || !rawDocB) {
    return null
  }

  const diff = diffLines(rawDocA, rawDocB)

  const changed = diff.some((part) => part.added || part.removed)

  return changed ? renderDiff(diff) : null
}

function renderDiff(diff: ChangeObject<string>[]): string {
  // TODO: Show less of the unchanged lines
  // TODO: Match indent level of unchanged parts to changed parts
  return diff
    .map((part) => {
      if (part.added) {
        return chalk.green(`+${part.value}`)
      }
      if (part.removed) {
        return chalk.red(`-${part.value}`)
      }
      return chalk.gray(part.value)
    })
    .join("")
}

function diffObjects(objA: object, objB: object): string | null {
  objA = sanitizeValue(objA)
  objB = sanitizeValue(objB)

  if (isEqual(objA, objB)) {
    return null
  }

  const diff = diffJson(objA, objB)

  return renderDiff(diff)
}

function getSeparatorBar(width: number = 40) {
  return styles.accent(repeat("─", width))
}
