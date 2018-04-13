/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../plugin-context"
import { BooleanParameter, Command, ParameterValues, StringParameter } from "./base"
import { values, padEnd } from "lodash"
import { TestTask } from "../tasks/test"
import { splitFirst } from "../util"
import chalk from "chalk"
import { TaskResults } from "../task-graph"

export const testArgs = {
  module: new StringParameter({
    help: "The name of the module(s) to deploy (skip to test all modules). " +
      "Use comma as separator to specify multiple modules.",
  }),
}

export const testOpts = {
  group: new StringParameter({
    help: "Only run tests with the specfied group (e.g. unit or integ)",
    alias: "g",
  }),
  force: new BooleanParameter({ help: "Force re-test of module(s)", alias: "f" }),
  "force-build": new BooleanParameter({ help: "Force rebuild of module(s)" }),
}

export type Args = ParameterValues<typeof testArgs>
export type Opts = ParameterValues<typeof testOpts>

export class TestCommand extends Command<typeof testArgs, typeof testOpts> {
  name = "test"
  help = "Test all or specified modules"

  arguments = testArgs
  options = testOpts

  async action(ctx: PluginContext, args: Args, opts: Opts): Promise<TaskResults> {
    const names = args.module ? args.module.split(",") : undefined
    const modules = await ctx.getModules(names)

    ctx.log.header({
      emoji: "thermometer",
      command: `Running tests`,
    })

    await ctx.configureEnvironment()

    for (const module of values(modules)) {
      const config = await module.getConfig()

      for (const testGroup of Object.keys(config.test)) {
        if (opts.group && testGroup !== opts.group) {
          continue
        }
        const testSpec = config.test[testGroup]
        const task = new TestTask(ctx, module, testGroup, testSpec, opts.force, opts["force-build"])
        await ctx.addTask(task)
      }
    }

    const results = await ctx.processTasks()
    let failed = 0

    for (const key in results) {
      // TODO: this is brittle, we should have a more verbose data structure coming out of the TaskGraph
      const [type, taskKey] = splitFirst(key, ".")

      if (type !== "test") {
        continue
      }

      const result = results[key]

      if (!result.success) {
        const [moduleName, testType] = splitFirst(taskKey, ".")
        const divider = padEnd("—", 80)

        ctx.log.error(`${testType} tests for ${moduleName} failed. Here is the output:`)
        ctx.log.error(divider)
        ctx.log.error(result.output)
        ctx.log.error(divider + "\n")

        failed++
      }
    }

    if (failed) {
      ctx.log.error({ emoji: "warning", msg: `${failed} tests runs failed! See log output above.\n` })
    } else {
      ctx.log.info("")
      ctx.log.info({ emoji: "heavy_check_mark", msg: chalk.green(` All tests passing!\n`) })
    }

    return results
  }
}
