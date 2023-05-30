/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import chalk from "chalk"
import { relative, sep } from "path"
import { actionReferenceToString } from "../../actions/base"
import { ResolvedBuildAction } from "../../actions/build"
import { ResolvedDeployAction } from "../../actions/deploy"
import { ResolvedRunAction } from "../../actions/run"
import { ResolvedTestAction } from "../../actions/test"
import { Action, ActionKind, ActionState, ResolvedAction, actionKinds, actionStateTypes } from "../../actions/types"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params"
import { ResolvedConfigGraph } from "../../graph/config-graph"
import { Log, createActionLog } from "../../logger/log-entry"
import { printHeader } from "../../logger/util"
import { ActionRouter } from "../../router/router"
import { sanitizeValue } from "../../util/logging"
import { deepFilter } from "../../util/objects"
import { dedent, deline, renderTable } from "../../util/string"
import { Command, CommandParams, CommandResult } from "../base"
import { createSchema, joi, joiArray } from "../../config/common"
import { actionConfigSchema } from "../../actions/helpers"

interface GetActionsCommandResultItem {
  name: string
  kind: ActionKind
  type: string
  state?: ActionState
  path?: string
  disabled?: boolean
  moduleName?: string
  dependencies?: Action[]
  dependents?: Action[]
}

export interface GetActionsCommandResult {
  actions: GetActionsCommandResultItem[]
}

type ResolvedActionWithState = ResolvedAction & {
  state?: ActionState
}

export const getActionsCmdOutputSchema = createSchema({
  name: "get-actions-output",
  keys: () => ({
    name: joi.string().required(),
    kind: joi
      .string()
      .required()
      .allow(...actionKinds)
      .description(`Action kind (e.g. Build).`),
    type: joi.string().required().description(`Action Type (e.g. 'container').`),
    state: joi
      .string()
      .allow(...actionStateTypes)
      .only()
      .description("The state of the action."),
    path: joi.string().description("The relative path of the action config file."),
    disabled: joi.boolean().description("Flag to identify if action is disabled."),
    moduleName: joi
      .string()
      .description("The name of the module the action is derived from. Only available for converted actions."),
    dependencies: joiArray(actionConfigSchema()).description("Dependencies of the action."),
    dependents: joiArray(actionConfigSchema()).description("Dependents of the action."),
  }),
})

const getActionsArgs = {
  actions: new StringsParameter({
    help: deline`
    Specify name(s) of the action(s) to list. You may specify multiple actions, separated by spaces.
      Skip to return all actions.
    `,
    spread: true,
    required: false,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs)
    },
  }),
}

const getActionsOpts = {
  "detail": new BooleanParameter({
    help: deline`
      Show the detailed info for each action, including path, dependencies, dependents, associated module and if the action is disabled.
    `,
  }),
  "include-state": new BooleanParameter({
    help: "Include state of action(s) in output.",
  }),
  "sort": new ChoicesParameter({
    help: deline`Sort the actions result by action name, kind or type. By default action results
    are sorted by name.
    `,
    choices: ["name", "kind", "type"],
    defaultValue: "name",
  }),
  "kind": new ChoicesParameter({
    help: deline`Choose actions of specific kind only. By default all actions are shown.
    `,
    choices: ["build", "deploy", "run", "test"],
  }),
}

type Args = typeof getActionsArgs
type Opts = typeof getActionsOpts

export class GetActionsCommand extends Command {
  name = "actions"
  help = "Outputs all or specified actions."
  description = dedent`
    Outputs all or specified actions. Use with --output=json and jq to extract specific fields.

    Examples:

      garden get actions                                         # list all actions in the project
      garden get actions --include-state                         # list all actions in the project with state in output
      garden get actions --detail                                # list all actions in project with detailed info
      garden get actions --kind deploy                           # only list the actions of kind 'Deploy'
      garden get actions A B --kind build --sort type            # list  actions A and B of kind 'Build' sorted by type
      garden get actions --include-state -o=json                 # get json output
`

  arguments = getActionsArgs
  options = getActionsOpts

  outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the actions."),
    })

  printHeader({ log }) {
    printHeader(log, "Get Actions", "📖")
  }

  async action({
    garden,
    log,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    const { actions: keys } = args
    const includeStateInOutput = opts["include-state"]
    const isOutputDetailed = opts["detail"]
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })

    const kindOpt = opts["kind"]
    let actions: ResolvedActionWithState[] = []

    switch (kindOpt) {
      case "build":
        actions = graph.getBuilds({ names: keys })
        break
      case "deploy":
        actions = graph.getDeploys({ names: keys })
        break
      case "run":
        actions = graph.getRuns({ names: keys })
        break
      case "test":
        actions = graph.getTests({ names: keys })
        break
      default:
        actions = graph.getActions({ refs: keys })
        break
    }

    if (opts["sort"] === "kind") {
      actions.sort((a, b) => (a.kind > b.kind ? 1 : -1))
    } else if (opts["sort"] === "type") {
      actions.sort((a, b) => (a.type > b.type ? 1 : -1))
    } else {
      actions.sort((a, b) => (a.name > b.name ? 1 : -1))
    }

    if (includeStateInOutput) {
      // get state of each action if --include-state flag is set
      actions = await Bluebird.map(actions, async (a) => {
        a.state = await getActionState(a, router, graph, log)
        return a
      })
    }

    let getActionsOutput: GetActionsCommandResultItem[] = []

    getActionsOutput = actions.map((a) => {
      let tmp: GetActionsCommandResultItem = {
        name: a.name,
        kind: a.kind,
        type: a.type,
      }
      if (includeStateInOutput) {
        tmp.state = a.state
      }
      if (isOutputDetailed) {
        tmp = {
          ...tmp,
          path: getRelativeActionPath(garden.projectRoot, a.configPath() ?? ""),
          dependencies: a.getDependencies(),
          dependents: getActionDependents(a, graph),
          disabled: a.isDisabled(),
          moduleName: a.moduleName() ?? undefined,
        }
      }
      return tmp
    })

    let cols = ["Name", "Kind", "Type"]
    if (includeStateInOutput) {
      cols = cols.concat(["State"])
    }

    // flag to show/hide modules column
    // only needed if action is derived from module
    let showModuleCol = false

    let rows: string[][] = []
    rows = getActionsOutput.map((a) => {
      let r = [chalk.cyan.bold(a.name), a.kind, a.type]
      if (includeStateInOutput) {
        r.push(a.state ?? "unknown")
      }
      if (isOutputDetailed) {
        r = r.concat([
          a.path ?? "",
          formatActionsReferenceToString(a.dependencies) ?? "",
          formatActionsReferenceToString(a.dependents) ?? "",
          a.disabled ? "true" : "false",
        ])
      }
      if (a.moduleName) {
        r.push(a.moduleName)
        showModuleCol = true
      }
      return r
    })
    if (isOutputDetailed) {
      cols = cols.concat(["Path", "Dependencies", "Dependents", "Disabled", ...(showModuleCol ? ["Module"] : [])])
    }

    const heading = cols.map((s) => chalk.bold(s))

    log.info("")
    log.info(renderTable([heading].concat(rows)))

    const sanitized = sanitizeValue(deepFilter(getActionsOutput, (_, key) => key !== "executedAction"))

    return { result: { actions: sanitized } }
  }
}

function formatActionsReferenceToString(actions: Action[] | undefined): string | undefined {
  return actions?.map(actionReferenceToString).join("\n")
}

function getActionDependents(action: Action, graph: ResolvedConfigGraph): Action[] {
  return graph.getDependants({ kind: action.kind, name: action.name, recursive: false })
}

function getRelativeActionPath(projectRoot: string, actionConfigPath: string): string {
  const relPath = relative(projectRoot, actionConfigPath)
  return relPath.startsWith("..") ? relPath : "." + sep + relPath
}

async function getActionState(
  action: Action,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
): Promise<ActionState> {
  const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
  let state: ActionState
  switch (action.kind) {
    case "Build":
      state = (await router.build.getStatus({ action: action as ResolvedBuildAction, log: actionLog, graph }))?.result
        ?.state
      break
    case "Deploy":
      state = (await router.deploy.getStatus({ action: action as ResolvedDeployAction, log: actionLog, graph }))?.result
        ?.state
      break
    case "Run":
      state = (await router.run.getResult({ action: action as ResolvedRunAction, log: actionLog, graph }))?.result
        ?.state
      break
    case "Test":
      state = (await router.test.getResult({ action: action as ResolvedTestAction, log: actionLog, graph }))?.result
        ?.state
      break
  }

  return state
}
