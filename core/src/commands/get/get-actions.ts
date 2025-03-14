/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getActionState, getRelativeActionConfigPath } from "../../actions/helpers.js"
import type { ActionKind, ActionState, ActionVersion, ResolvedAction } from "../../actions/types.js"
import { actionKinds, actionStates } from "../../actions/types.js"
import { BooleanParameter, ChoicesParameter, StringsParameter } from "../../cli/params.js"
import { createSchema, joi, joiArray } from "../../config/common.js"
import { printHeader } from "../../logger/util.js"
import { styles } from "../../logger/styles.js"
import { dedent, deline, renderTable } from "../../util/string.js"
import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { sortBy } from "lodash-es"

interface GetActionsCommandResultItem {
  name: string
  kind: ActionKind
  type: string
  state?: ActionState
  path?: string
  disabled?: boolean
  version?: ActionVersion
  allowPublish?: boolean
  publishId?: string
  moduleName?: string
  dependencies?: string[]
  dependents?: string[]
}

export interface GetActionsCommandResult {
  actions: GetActionsCommandResultItem[]
}

export type ResolvedActionWithState = ResolvedAction & {
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
      .allow(...actionStates)
      .only()
      .description("The state of the action."),
    path: joi.string().description("The relative path of the action config file."),
    disabled: joi.boolean().description("Flag to identify if action is disabled."),
    version: joi
      .object()
      .keys({
        configVersion: joi.string().required().description("The version string of the action's config."),
        sourceVersion: joi.string().required().description("The version string of the action's source."),
        versionString: joi.string().required().description("The short version string of the action."),
        versionStringFull: joi.string().required().description("The full version string of the action."),
        dependencyVersions: joi
          .object()
          .pattern(joi.string(), joi.string())
          .required()
          .description("Map with the version strings of the action's dependencies."),
        files: joiArray(joi.string()).required().description("List of the files included in the action."),
      })
      .description("Object with the full version information of the action."),
    allowPublish: joi
      .boolean()
      .description("Flag to identify whether publishing the build is enabled. Only available for build actions."),
    publishId: joi
      .string()
      .description("The image ID used to publish the image of the action. Only available for build actions."),
    moduleName: joi
      .string()
      .description("The name of the module the action is derived from. Only available for converted actions."),
    dependencies: joiArray(joi.string()).description("List of references of all dependencies of the action."),
    dependents: joiArray(joi.string()).description("List of references of all the dependents of the action."),
  }),
})

const getActionsArgs = {
  names: new StringsParameter({
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

export type Args = typeof getActionsArgs
export type Opts = typeof getActionsOpts

export class GetActionsCommand extends Command {
  name = "actions"
  help = "Outputs all or specified actions."
  override description = dedent`
    Outputs all or specified actions. Use with --output=json and jq to extract specific fields.

    Examples:

      garden get actions                                  # list all actions in the project
      garden get actions --include-state                  # list all actions in the project with state in output
      garden get actions --detail                         # list all actions in project with detailed info
      garden get actions --kind deploy                    # only list the actions of kind 'Deploy'
      garden get actions a b --kind build --sort type     # list actions 'a' and 'b' of kind 'Build' sorted by type
      garden get actions build.a deploy.b                 # list actions 'build.a' and 'deploy.b'
      garden get actions --include-state -o=json          # get json output
`

  override arguments = getActionsArgs
  override options = getActionsOpts

  override outputsSchema = () =>
    joi.object().keys({
      actions: joiArray(getActionsCmdOutputSchema()).description("A list of the actions."),
    })

  override printHeader({ log }) {
    printHeader(log, "Get Actions", "📖")
  }

  async action({
    garden,
    log,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<GetActionsCommandResult>> {
    const includeStateInOutput = opts["include-state"]
    const isOutputDetailed = opts["detail"]
    const router = await garden.getActionRouter()

    let actionsFilter: string[] | undefined = undefined

    if (args.names && opts.kind) {
      actionsFilter = args.names.map((name) => `${opts.kind}.${name}`)
    } else if (args.names) {
      actionsFilter = args.names
    } else if (opts.kind) {
      actionsFilter = [opts.kind + ".*"]
    }

    const graph = await garden.getResolvedConfigGraph({ log, emit: false, actionsFilter, statusOnly: true })

    const kindOpt = opts["kind"]?.toLowerCase()
    let actions: ResolvedActionWithState[] = []

    switch (kindOpt) {
      case "build":
        actions = graph.getBuilds({ includeNames: args.names })
        break
      case "deploy":
        actions = graph.getDeploys({ includeNames: args.names })
        break
      case "run":
        actions = graph.getRuns({ includeNames: args.names })
        break
      case "test":
        actions = graph.getTests({ includeNames: args.names })
        break
      default:
        actions = graph.getActions({ refs: args.names })
        break
    }

    if (opts["sort"] === "kind" || opts["sort"] === "type") {
      // secondary sort by name in case of sort by kind/type
      actions = sortBy(actions, [opts["sort"], "name"])
    } else {
      actions.sort((a, b) => (a.name > b.name ? 1 : -1))
    }

    if (includeStateInOutput) {
      // get state of each action if --include-state flag is set
      actions = await Promise.all(
        actions.map(async (a) => {
          a.state = await getActionState(a, router, graph, log)
          return a
        })
      )
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
          path: getRelativeActionConfigPath(garden.projectRoot, a),
          dependencies: a
            .getDependencies({ includeDisabled: true })
            .map((d) => d.key())
            .sort(),
          dependents: graph
            .getDependants({ kind: a.kind, name: a.name, recursive: false })
            .map((d) => d.key())
            .sort(),
          disabled: a.isDisabled(),
          version: a.getFullVersion(),
          allowPublish: a.getConfig().allowPublish ?? undefined,
          publishId: a.getSpec("publishId") ?? undefined,
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
      let r = [styles.highlight.bold(a.name), a.kind, a.type]
      if (includeStateInOutput) {
        r.push(a.state ?? "unknown")
      }
      if (isOutputDetailed) {
        r = r.concat([
          a.path ?? "",
          a.dependencies?.join("\n") ?? "",
          a.dependents?.join("\n") ?? "",
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

    const heading = cols.map((s) => styles.bold(s))

    if (getActionsOutput.length > 0) {
      log.info("")
      log.info(renderTable([heading].concat(rows)))
    } else {
      log.info(`No${opts["kind"] ? " " + opts["kind"] : ""} actions defined for project ${garden.projectName}`)
    }

    return { result: { actions: getActionsOutput } }
  }
}
