/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeepPrimitiveMap } from "../config/common"
import { highlightYaml, safeDumpYaml } from "../util/util"
import { Command, CommandParams, CommandResult } from "./base"
import { omit } from "lodash"
import { printHeader } from "../logger/util"

export class ScanCommand extends Command {
  name = "scan"
  help = "Scans your project and outputs an overview of all modules."

  printHeader({ headerLog }) {
    printHeader(headerLog, "Scan", "mag_right")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult<DeepPrimitiveMap>> {
    const graph = await garden.getConfigGraph(log)
    const modules = graph.getModules().map((m) => {
      return omit(m, ["_config", "cacheContext", "serviceNames", "taskNames"])
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
        safeDumpYaml(shortOutput, {
          noRefs: true,
          sortKeys: true,
        })
      )
    )

    return { result: <DeepPrimitiveMap>(<any>output) }
  }
}
