/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandParams,
  CommandResult,
  handleProcessResults,
  ProcessCommandResult,
  ProcessResultMetadata,
  prepareProcessResults,
  processCommandResultSchema,
  resultMetadataKeys,
} from "./base"
import { Module } from "../types/module"
import { PublishTask } from "../tasks/publish"
import { GraphResults } from "../task-graph"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { ConfigGraph } from "../config-graph"
import { PublishResult, publishResultSchema } from "../types/plugin/module/publishModule"
import { joiIdentifierMap } from "../config/common"
import { StringsParameter, BooleanParameter } from "../cli/params"

export const publishArgs = {
  modules: new StringsParameter({
    help:
      "The name(s) of the module(s) to publish (skip to publish all modules). " +
      "Use comma as a separator to specify multiple modules.",
  }),
}

export const publishOpts = {
  "force-build": new BooleanParameter({
    help: "Force rebuild of module(s) before publishing.",
  }),
  "allow-dirty": new BooleanParameter({
    help: "Allow publishing dirty builds (with untracked/uncommitted changes).",
  }),
}

type Args = typeof publishArgs
type Opts = typeof publishOpts

interface PublishCommandResult extends ProcessCommandResult {
  published: { [moduleName: string]: PublishResult & ProcessResultMetadata }
}

export class PublishCommand extends Command<Args, Opts> {
  name = "publish"
  help = "Build and publish module(s) to a remote registry."

  workflows = true

  description = dedent`
    Publishes built module artifacts for all or specified modules.
    Also builds modules and dependencies if needed.

    Examples:

        garden publish                # publish artifacts for all modules in the project
        garden publish my-container   # only publish my-container
        garden publish --force-build  # force re-build of modules before publishing artifacts
        garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)
  `

  arguments = publishArgs
  options = publishOpts

  outputsSchema = () =>
    processCommandResultSchema().keys({
      published: joiIdentifierMap(publishResultSchema().keys(resultMetadataKeys())).description(
        "A map of all modules that were published (or scheduled/attempted for publishing) and the results."
      ),
    })

  async action({
    garden,
    log,
    headerLog,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<PublishCommandResult>> {
    printHeader(headerLog, "Publish modules", "rocket")

    const graph = await garden.getConfigGraph(log)
    const modules = graph.getModules({ names: args.modules })

    const results = await publishModules({
      garden,
      graph,
      log,
      modules,
      forceBuild: !!opts["force-build"],
      allowDirty: !!opts["allow-dirty"],
    })

    const output = await handleProcessResults(footerLog, "publish", { taskResults: results })

    return {
      ...output,
      result: {
        ...output.result!,
        published: prepareProcessResults("publish", output.result!.graphResults),
      },
    }
  }
}

export async function publishModules({
  garden,
  graph,
  log,
  modules,
  forceBuild,
  allowDirty,
}: {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  modules: Module<any>[]
  forceBuild: boolean
  allowDirty: boolean
}): Promise<GraphResults> {
  if (!!allowDirty) {
    log.warn(`The --allow-dirty flag has been deprecated. It no longer has an effect.`)
  }

  const tasks = modules.map((module) => {
    return new PublishTask({ garden, graph, log, module, forceBuild })
  })

  return await garden.processTasks(tasks)
}
