/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as yaml from "js-yaml"
import {
  ContextStatus,
  PluginContext,
} from "../plugin-context"
import {
  Command,
  CommandResult,
} from "./base"
import { highlightYaml } from "../util"

export class StatusCommand extends Command {
  name = "status"
  alias = "s"
  help = "Outputs the status of your environment."

  async action(ctx: PluginContext): Promise<CommandResult<ContextStatus>> {
    const status = await ctx.getStatus()
    const yamlStatus = yaml.safeDump(status, { noRefs: true, skipInvalid: true })

    // TODO: do a nicer print of this by default and add --yaml/--json options (maybe globally) for exporting
    ctx.log.info(highlightYaml(yamlStatus))

    return { result: status }
  }
}
