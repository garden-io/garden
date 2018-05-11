/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { PluginContext } from "../plugin-context"
import { highlightYaml } from "../util"
import { Command } from "./base"
import Bluebird = require("bluebird")
import {
  mapValues,
  omit,
} from "lodash"

export class ScanCommand extends Command {
  name = "scan"
  help = "Scans your project and outputs an overview of all modules"

  async action(ctx: PluginContext) {
    const modules = await ctx.getModules()

    const output = await Bluebird.props(mapValues(modules, async (m) => {
      return {
        name: m.name,
        type: m.type,
        path: m.path,
        description: m.config.description,
        version: await m.getVersion(),
        config: m.config,
      }
    }))

    const shortOutput = mapValues(output, m => omit(m, ["config"]))

    ctx.log.info(highlightYaml(safeDump(shortOutput, { noRefs: true, skipInvalid: true })))

    return output
  }
}
