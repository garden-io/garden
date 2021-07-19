/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { GardenModule } from "../types/module"
import { PublishTask } from "../tasks/publish"
import { GraphResults } from "../task-graph"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { ConfigGraph } from "../config-graph"
import { PublishModuleResult, publishResultSchema } from "../types/plugin/module/publishModule"
import { joiIdentifierMap } from "../config/common"
import { StringsParameter, BooleanParameter, StringOption } from "../cli/params"
import { emitStackGraphEvent } from "./helpers"

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
  "tag": new StringOption({
    help:
      "Override the tag on the built artifacts. You can use the same sorts of template " +
      "strings as when templating values in module configs, with the addition of " +
      "${module.*} tags, allowing you to reference the name and Garden version of the " +
      "module being tagged.",
  }),
}

type Args = typeof publishArgs
type Opts = typeof publishOpts

interface PublishCommandResult extends ProcessCommandResult {
  published: { [moduleName: string]: PublishModuleResult & ProcessResultMetadata }
}

export class PublishCommand extends Command<Args, Opts> {
  name = "publish"
  help = "Build and publish module(s) (e.g. container images) to a remote registry."

  workflows = true
  streamEvents = true

  description = dedent`
    Publishes built module artifacts for all or specified modules.
    Also builds modules and build dependencies if needed.

    By default the artifacts/images are tagged with the Garden module version, but you can also specify the \`--tag\` option to specify a specific string tag _or_ a templated tag. Any template values that can be used on the module being tagged are available, in addition to ${"${module.name}"}, ${"${module.version}"} and ${"${module.hash}"} tags that allows referencing the name of the module being tagged, as well as its Garden version. ${"${module.version}"} includes the "v-" prefix normally used for Garden versions, and ${"${module.hash}"} doesn't.

    Examples:

        garden publish                # publish artifacts for all modules in the project
        garden publish my-container   # only publish my-container
        garden publish --force-build  # force re-build of modules before publishing artifacts
        garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)

        # Publish my-container with a tag of v0.1
        garden publish my-container --tag "v0.1"

        # Publish my-container with a tag of v1.2-<hash> (e.g. v1.2-abcdef123)
        garden publish my-container --tag "v1.2-${"${module.hash}"}"
  `

  arguments = publishArgs
  options = publishOpts

  outputsSchema = () =>
    processCommandResultSchema().keys({
      published: joiIdentifierMap(publishResultSchema().keys(resultMetadataKeys())).description(
        "A map of all modules that were published (or scheduled/attempted for publishing) and the results."
      ),
    })

  printHeader({ headerLog }) {
    printHeader(headerLog, "Publish modules", "rocket")
  }

  async action({
    garden,
    isWorkflowStepCommand,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<Args, Opts>): Promise<CommandResult<PublishCommandResult>> {
    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const modules = graph.getModules({ names: args.modules })

    const results = await publishModules({
      garden,
      graph,
      log,
      modules,
      forceBuild: !!opts["force-build"],
      allowDirty: !!opts["allow-dirty"],
      tagTemplate: opts.tag,
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
  tagTemplate,
}: {
  garden: Garden
  graph: ConfigGraph
  log: LogEntry
  modules: GardenModule<any>[]
  forceBuild: boolean
  allowDirty: boolean
  tagTemplate?: string
}): Promise<GraphResults> {
  // TODO: remove in 0.13
  if (!!allowDirty) {
    log.warn(`The --allow-dirty flag has been deprecated. It no longer has an effect.`)
  }

  const tasks = modules.map((module) => {
    return new PublishTask({ garden, graph, log, module, forceBuild, tagTemplate })
  })

  return await garden.processTasks(tasks)
}
