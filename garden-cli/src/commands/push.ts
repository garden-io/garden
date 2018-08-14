/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  BooleanParameter,
  Command,
  CommandParams,
  CommandResult,
  handleTaskResults,
  ParameterValues,
  StringsParameter,
} from "./base"
import { PluginContext } from "../plugin-context"
import { Module } from "../types/module"
import { PushTask } from "../tasks/push"
import { RuntimeError } from "../exceptions"
import { TaskResults } from "../task-graph"
import { Garden } from "../garden"
import dedent = require("dedent")

export const pushArgs = {
  module: new StringsParameter({
    help: "The name of the module(s) to push (skip to push all modules). " +
      "Use comma as separator to specify multiple modules.",
  }),
}

export const pushOpts = {
  "force-build": new BooleanParameter({
    help: "Force rebuild of module(s) before pushing.",
  }),
  "allow-dirty": new BooleanParameter({
    help: "Allow pushing dirty builds (with untracked/uncommitted files).",
  }),
}

export type Args = ParameterValues<typeof pushArgs>
export type Opts = ParameterValues<typeof pushOpts>

export class PushCommand extends Command<typeof pushArgs, typeof pushOpts> {
  name = "push"
  help = "Build and push built module(s) to remote registry."

  description = dedent`
    Pushes built module artifacts for all or specified modules.
    Also builds modules and dependencies if needed.

    Examples:

        garden push                # push artifacts for all modules in the project
        garden push my-container   # only push my-container
        garden push --force-build  # force re-build of modules before pushing artifacts
        garden push --allow-dirty  # allow pushing dirty builds (which usually triggers error)
  `

  arguments = pushArgs
  options = pushOpts

  async action({ garden, ctx, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<TaskResults>> {
    ctx.log.header({ emoji: "rocket", command: "Push modules" })

    const modules = await ctx.getModules(args.module)

    const results = await pushModules(garden, ctx, modules, !!opts["force-build"], !!opts["allow-dirty"])

    return handleTaskResults(ctx, "push", { taskResults: results })
  }
}

export async function pushModules(
  garden: Garden,
  ctx: PluginContext,
  modules: Module<any>[],
  forceBuild: boolean,
  allowDirty: boolean,
): Promise<TaskResults> {
  for (const module of modules) {
    const version = module.version

    if (version.dirtyTimestamp && !allowDirty) {
      throw new RuntimeError(
        `Module ${module.name} has uncommitted changes. ` +
        `Please commit them, clean the module's source tree or set the --allow-dirty flag to override.`,
        { moduleName: module.name, version },
      )
    }

    const task = new PushTask({ ctx, module, forceBuild })
    await garden.addTask(task)
  }

  return await garden.processTasks()
}
