/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult, CommandParams } from "../base.js"
import { Command } from "../base.js"
import { printHeader } from "../../logger/util.js"
import { fromPairs } from "lodash-es"
import type { PrimitiveMap } from "../../config/common.js"
import { joiVariables } from "../../config/common.js"
import { renderTable, dedent } from "../../util/string.js"
import { resolveProjectOutputs } from "../../outputs.js"
import { styles } from "../../logger/styles.js"

export class GetOutputsCommand extends Command {
  name = "outputs"
  help = "Resolves and returns the outputs of the project."

  override description = dedent`
    Resolves and returns the outputs of the project. If necessary, this may involve deploying services and/or running
    tasks referenced by the outputs in the project configuration.

    Examples:

        garden get outputs                 # resolve and print the outputs from the project
        garden get outputs --env=prod      # resolve and print the outputs from the project for the prod environment
        garden get outputs --output=json   # resolve and return the project outputs in JSON format
  `

  override outputsSchema = () => joiVariables().description("A map of all the defined project outputs, fully resolved.")

  override printHeader({ log }) {
    printHeader(log, "Resolving project outputs", "📓")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult<PrimitiveMap>> {
    const outputs = await resolveProjectOutputs(garden, log)

    const rows = [
      { [styles.bold("Name:")]: [styles.bold("Value:")] },
      ...outputs.map((o) => ({ [styles.highlight.bold(o.name)]: [o.value?.toString().trim()] })),
    ]
    log.info("")
    log.info(styles.accent.bold("Outputs:"))
    log.info(renderTable(rows))

    return { result: fromPairs(outputs.map((o) => [o.name, o.value])) }
  }
}
