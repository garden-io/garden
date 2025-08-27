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
import { BooleanParameter, EnvironmentParameter, StringParameter, StringsParameter, TagsOption } from "../cli/params.js"
import tmp from "tmp-promise"
import { GitCli } from "../vcs/git.js"
import { ParameterError } from "../exceptions.js"
import type { DeepPrimitiveMap, StringMap } from "../config/common.js"
import { parseActionReference } from "../config/common.js"
import type { ConfigGraph, RenderedNode } from "../graph/config-graph.js"
import type { ActionKind, ActionVersion } from "../actions/types.js"
import { replaceExcludeValues, type BaseAction } from "../actions/base.js"
import { Garden } from "../garden.js"
import type { BaseGardenResource } from "../config/base.js"
import { fromPairs, isEqual, omit, repeat } from "lodash-es"
import { indentLines } from "../util/string.js"
import { styles } from "../logger/styles.js"
import type { Log } from "../logger/log-entry.js"
import type { VcsFile } from "../vcs/vcs.js"
import type { ChangeObject } from "diff"
import { diffJson, diffLines } from "diff"
import fsExtra from "fs-extra"
import { deepResolveContext } from "../config/template-contexts/base.js"
import { sanitizeValue } from "../util/logging.js"
import { resolveWorkflowConfig } from "../config/workflow.js"
const { readFile } = fsExtra

const diffArgs = {}

const diffOpts = {
  "commit": new StringParameter({
    help: "A commit ID to compare with.",
  }),
  "branch": new StringParameter({
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
  // TODO: Option to diff source file contents as well
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
  resolvedConfigDiff: string | null
}

interface ProjectDiff {
  status: "modified" | "unchanged"
  rawConfigDiff: string | null
  resolvedConfigDiff: string | null
  resolvedVariablesDiff: string | null
}

interface ActionDependencyNode {
  status: DiffStatus
  key: string
  versionA: ActionVersion | null
  versionB: ActionVersion | null
  dependants: ActionDependencyNode[]
  dependencies: ActionDependencyNode[]
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
  modifiedDependantSubgraph: ActionDependencyNode[]
  modifiedDependenciesSubgraph: ActionDependencyNode[]
}

export class DiffCommand extends Command<Args, Opts> {
  name = "diff"
  help = "Compare the current working directory Garden project with the specified branch or commit."

  override description = dedent`
    Compare the current working directory Garden project with the specified branch or commit.

    Use this to understand the impact of your changes on action versions.

    Note that in the output, "A" (e.g. "version A") refers to the current working directory project, and "B" refers to the project at the specified branch or commit. When something is reported as "added" (such as an action, file, new lines in a config etc.), it means it's present in the current project but not in the comparison project. Similarly, "removed" means it's present in the comparison project but not in the current project.
  `

  override arguments = diffArgs

  override options = diffOpts

  override printHeader({ log, args }) {
    printHeader(log, "Diffing Garden project with branch/commit " + chalk.white.bold(args.commitish), "🔍")
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
    const gardenB = await Garden.factory(projectRootB, {
      environmentString: opts["diff-env"] || `${gardenA.environmentName}.${gardenA.namespace}`,
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

    const toposortedActions = graphA.render().nodes

    // Compare actions (first pass)
    const actionsPreliminary: ActionDiffPreliminary[] = await Promise.all(
      toposortedActions.map((node) => actionDiffPreliminary({ log, gardenA, gardenB, graphA, graphB, node }))
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
    const actions: ActionDiff[] = []

    for (const diff of actionsPreliminary) {
      const diffA = indexedDiffs[diff.key]
      const diffB = indexedDiffs[diff.key]

      if (!diffA) {
        // Action is removed in the current project
        actions.push({
          ...diff,
          diffSummary: diff.diffDescriptions.join("\n"),
          // TODO: Should we populate these for a removed action?
          modifiedDependantSubgraph: [],
          modifiedDependenciesSubgraph: [],
        })
        continue
      }

      if (!diffB) {
        // Action is added in the current project
        actions.push({
          ...diff,
          diffSummary: diff.diffDescriptions.join("\n"),
          // TODO: Should we populate these for a new action?
          modifiedDependantSubgraph: [],
          modifiedDependenciesSubgraph: [],
        })
        continue
      }

      const actionA = graphA.getActionByRef({ kind: diffA.kind, name: diffA.name })
      const actionB = graphB.getActionByRef({ kind: diffB.kind, name: diffB.name })

      const status = diffA.status
      const versionA = diffA.versionA
      const versionB = diffA.versionB
      const diffDescriptions = diffA.diffDescriptions

      let diffSummary = `Action ${chalk.white.bold(actionA.key())} ${status}`
      if (status === "modified") {
        diffSummary += ` (${versionA?.versionStringFull} -> ${versionB?.versionStringFull})`
      }

      // If the action is modified, we need to compute the modified dependants and dependencies
      // We should also attempt to highlight possible reasons for the version change
      const modifiedDependantSubgraph: ActionDependencyNode[] = []
      const modifiedDependenciesSubgraph: ActionDependencyNode[] = []

      if (status === "modified") {
        // Work out the modified dependants
        const dependants = graphA.getDependants({ ...actionA.reference(), recursive: true })
        const modifiedDependants = dependants.filter((d) => {
          const actionDiff = indexedDiffs[d.key()]
          if (!actionDiff) {
            return false
          }
          return actionDiff.status === "modified"
        })

        // Create a simple tree structure of the dependants
        const simpleDependants: DeepPrimitiveMap = {}
      }

      // Summarize
      if (diffDescriptions.length > 0) {
        diffSummary +=
          "\n" +
          dedent`
            ${getSeparatorBar()}
            ${indentLines(diffDescriptions, 2).join("\n\n")}
            ${getSeparatorBar()}
          `
      }

      actions.push({
        ...diff,
        diffSummary,
        modifiedDependantSubgraph,
        modifiedDependenciesSubgraph,
      })
    }

    return {
      result: {
        projectConfig: projectConfigDiff,
        workflows: workflowDiffs,
        actions: actionsPreliminary,
      },
    }
  }
}

const projectConfigKeysToIgnore = ["internal", "configPath", "path"]

async function compareProjectConfig(log: Log, gardenA: Garden, gardenB: Garden) {
  log.info({
    msg: chalk.bold("\nProject configuration\n") + getSeparatorBar(),
  })

  const projectConfigA = gardenA.getProjectConfig()
  const projectConfigB = gardenB.getProjectConfig()

  const projectRawConfigDiff = await computeRawConfigDiff(log, projectConfigA, projectConfigB)

  const projectConfigFilteredA = omit(projectConfigA, projectConfigKeysToIgnore)
  const projectConfigFilteredB = omit(projectConfigB, projectConfigKeysToIgnore)

  const resolvedConfigDiff = diffObjects(projectConfigFilteredA, projectConfigFilteredB)

  const projectConfigDiff: ProjectDiff = {
    status: projectRawConfigDiff === null && resolvedConfigDiff === null ? "unchanged" : "modified",
    rawConfigDiff: projectRawConfigDiff,
    resolvedConfigDiff,
    resolvedVariablesDiff: null,
  }

  if (projectRawConfigDiff) {
    log.info({
      msg: chalk.bold("\nConfiguration file modified directly:\n") + indentBlock(projectRawConfigDiff, 2),
    })
  } else {
    log.info({
      msg: chalk.gray("Configuration file unchanged"),
    })
  }

  if (resolvedConfigDiff) {
    log.info({
      msg: chalk.bold("\nResolved configuration modified:\n") + indentBlock(resolvedConfigDiff, 2) + "\n",
    })
  } else {
    log.info({
      msg: chalk.gray("Resolved configuration unchanged"),
    })
  }

  // Compare resolved project variables
  const variablesA = deepResolveContext("project variables A", gardenA.variables) as DeepPrimitiveMap
  const variablesB = deepResolveContext("project variables B", gardenB.variables) as DeepPrimitiveMap

  const variablesDiff = diffObjects(variablesA, variablesB)

  if (variablesDiff) {
    log.info({
      msg: chalk.bold("\nResolved project variables modified:\n") + indentBlock(variablesDiff, 2) + "\n",
    })
  }

  log.info({
    msg: getSeparatorBar() + "\n",
  })

  return projectConfigDiff
}

async function actionDiffPreliminary({
  log,
  gardenA,
  gardenB,
  graphA,
  graphB,
  node,
}: {
  log: Log
  gardenA: Garden
  gardenB: Garden
  graphA: ConfigGraph
  graphB: ConfigGraph
  node: RenderedNode
}): Promise<ActionDiffPreliminary> {
  const actionA = graphA.getActionByRef({ kind: node.kind, name: node.name })
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
  const rawConfigDiff = await computeRawConfigDiff(log, actionA.getConfig(), actionB.getConfig())
  if (rawConfigDiff) {
    diffDescriptions.push(`Configuration modified directly:\n${rawConfigDiff}`)
  }

  // Resolved config
  const configFilteredA = replaceExcludeValues(actionA.getConfig(), actionA.createLog(log)) as object
  const configFilteredB = replaceExcludeValues(actionB.getConfig(), actionB.createLog(log)) as object
  const resolvedConfigDiff = diffObjects(configFilteredA, configFilteredB)

  if (resolvedConfigDiff) {
    diffDescriptions.push(`Resolved configuration changed:\n${resolvedConfigDiff}`)
  }

  // Source files
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

function computeDependencies(_actionA: BaseAction | null, _actionB: BaseAction | null): ActionDependencyNode[] {
  // TODO
  return []
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

    return color(` ${marker} ${file.path}`)
  })
  let detail = `Source files changed:\n${indentLines(fileList, 2).join("\n")}`

  if (files.length > changedFiles.length) {
    detail += `\n  ${chalk.gray(`${files.length - changedFiles.length} files unchanged`)}`
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
    filesA = await gardenA.vcs.getFiles({
      log,
      path: actionA.sourcePath(),
      // FIXME: We should use the minimal roots, as when resolving the graph
      scanRoot: actionA.sourcePath(),
    })
  }

  if (actionB) {
    filesB = await gardenB.vcs.getFiles({
      log,
      path: actionB.sourcePath(),
      // FIXME: We should use the minimal roots, as when resolving the graph
      scanRoot: actionB.sourcePath(),
    })
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

async function compareWorkflows(log: Log, gardenA: Garden, gardenB: Garden): Promise<WorkflowDiff[]> {
  const workflowConfigsRawA = await gardenA.getRawWorkflowConfigs()
  const workflowConfigsRawB = await gardenB.getRawWorkflowConfigs()

  const workflowDiffs: WorkflowDiff[] = []

  log.info({
    msg: chalk.bold("\nWorkflows\n") + getSeparatorBar(),
  })

  if (workflowConfigsRawA.length === 0 && workflowConfigsRawB.length === 0) {
    log.info({
      msg: chalk.gray("No Workflows found"),
    })
    return []
  }

  for (const configRawA of workflowConfigsRawA) {
    const configRawB = workflowConfigsRawB.find((w) => w.name === configRawA.name)
    if (!configRawB) {
      workflowDiffs.push({ status: "added", rawConfigDiff: null, resolvedConfigDiff: null })
      log.info({
        msg: chalk.bold(`Workflow ${configRawA.name} added`),
      })
      continue
    }

    const rawConfigDiff = await computeRawConfigDiff(log, configRawA, configRawB)

    let status: DiffStatus = "unchanged"

    if (rawConfigDiff) {
      log.info({
        msg:
          `\nWorkflow ${chalk.white.bold(configRawA.name)} configuration file modified directly:\n` +
          indentBlock(rawConfigDiff, 2) +
          "\n",
      })
      status = "modified"
    }

    const resolvedA = resolveWorkflowConfig(gardenA, configRawA)
    const resolvedB = resolveWorkflowConfig(gardenB, configRawB)

    const configFilteredA = omit(resolvedA, "internal") as object
    const configFilteredB = omit(resolvedB, "internal") as object

    const resolvedConfigDiff = diffObjects(configFilteredA, configFilteredB)

    if (resolvedConfigDiff) {
      log.info({
        msg:
          `\nWorkflow ${chalk.white.bold(configRawA.name)} resolved configuration modified:\n` +
          indentBlock(resolvedConfigDiff, 2) +
          "\n",
      })
      status = "modified"
    }

    if (status === "unchanged") {
      log.info({
        msg: chalk.gray(`Workflow ${configRawA.name} unchanged`),
      })
    }

    workflowDiffs.push({
      status,
      rawConfigDiff,
      resolvedConfigDiff: null,
    })
  }

  for (const configRawB of workflowConfigsRawB) {
    if (!workflowConfigsRawA.find((w) => w.name === configRawB.name)) {
      workflowDiffs.push({ status: "removed", rawConfigDiff: null, resolvedConfigDiff: null })
      log.info({
        msg: chalk.bold(`Workflow ${configRawB.name} removed`),
      })
    }
  }

  log.info({
    msg: getSeparatorBar() + "\n",
  })

  return workflowDiffs
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

  return renderDiff(diff)
}

function renderDiff(diff: ChangeObject<string>[]): string {
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
    .join("\n")
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
  return styles.accent(repeat("—", width))
}

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
