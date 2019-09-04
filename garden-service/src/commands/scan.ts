/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { DeepPrimitiveMap } from "../config/common"
import { highlightYaml } from "../util/util"
import { Command, CommandParams, CommandResult } from "./base"
import { omit } from "lodash"

export class ScanCommand extends Command {
  name = "scan"
  help = "Scans your project and outputs an overview of all modules."

  async action({ garden, log }: CommandParams): Promise<CommandResult<DeepPrimitiveMap>> {
    const modules = (await garden.resolveModuleConfigs()).map((m) => {
      return omit(m, ["_ConfigType", "cacheContext", "serviceNames", "taskNames"])
    })

    const output = { modules }

    const shortOutput = {
      modules: modules.map((m) => {
        m.serviceConfigs!.map((s) => delete s.spec)
        return omit(m, ["spec"])
      }),
    }

    log.info(
      highlightYaml(
        safeDump(shortOutput, {
          noRefs: true,
          skipInvalid: true,
          sortKeys: true,
        })
      )
    )

    return { result: <DeepPrimitiveMap>(<any>output) }
  }
}
