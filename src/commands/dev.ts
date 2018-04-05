/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, EnvironmentOption, ParameterValues } from "./base"
import { GardenContext } from "../context"
import { join } from "path"
import { STATIC_DIR } from "../constants"
import { spawnSync } from "child_process"
import chalk from "chalk"
import { deployServices } from "./deploy"
import { values } from "lodash"
import { sleep } from "../util"

const imgcatPath = join(__dirname, "..", "..", "bin", "imgcat")
const bannerPath = join(STATIC_DIR, "garden-banner-1-half.png")

export const options = {
  env: new EnvironmentOption(),
}

export type Opts = ParameterValues<typeof options>

export class DevCommand extends Command<Opts> {
  name = "dev"
  help = "Starts the garden development console"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    try {
      spawnSync(imgcatPath, [bannerPath], {
        stdio: "inherit",
      })
      console.log()
    } catch (_) {
      // the above fails for terminals other than iTerm2. just ignore the error and move on.
    }

    // console.log(chalk.bold(` garden - dev\n`))
    console.log(chalk.gray.italic(` Good afternoon, Jon! Let's get your environment wired up...\n`))

    opts.env && ctx.setEnvironment(opts.env)

    await ctx.configureEnvironment()

    const services = values(await ctx.getServices())

    await deployServices(ctx, services, false, false)

    ctx.log.info({ msg: "" })
    const watchEntry = ctx.log.info({ emoji: "koala", msg: `Waiting for code changes...` })

    while (true) {
      // TODO: actually do stuff
      await sleep(10000)
      watchEntry.setState({ emoji: "koala", msg: `Waiting for code changes...` })
    }
  }
}
