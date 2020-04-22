/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, BooleanParameter } from "../base"
import { ConfigDump } from "../../garden"

const options = {
  "exclude-disabled": new BooleanParameter({
    help: "Exclude disabled module, service, test, and task configs from output.",
  }),
}

type Opts = typeof options

export class GetConfigCommand extends Command<{}, Opts> {
  name = "config"
  help = "Outputs the fully resolved configuration for this project and environment."
  options = options

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<ConfigDump>> {
    const config = await garden.dumpConfig(log, !opts["exclude-disabled"])

    // Also filter out service, task, and test configs
    if (opts["exclude-disabled"]) {
      const filteredModuleConfigs = config.moduleConfigs.map((moduleConfig) => {
        const filteredConfig = {
          ...moduleConfig,
          serviceConfigs: moduleConfig.serviceConfigs.filter((c) => !c.disabled),
          taskConfigs: moduleConfig.taskConfigs.filter((c) => !c.disabled),
          testConfigs: moduleConfig.testConfigs.filter((c) => !c.disabled),
        }
        return filteredConfig
      })

      config.moduleConfigs = filteredModuleConfigs
    }

    // TODO: do a nicer print of this by default
    log.info({ data: config })

    return { result: config }
  }
}
