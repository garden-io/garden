/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams, PrepareParams } from "../base"
import { printHeader } from "../../logger/util"
import { fromPairs } from "lodash"
import { PrimitiveMap, joiVariables } from "../../config/common"
import { renderTable, dedent } from "../../util/string"
import chalk from "chalk"
import { resolveProjectOutputs } from "../../outputs"

export class GetOutputsCommand extends Command {
  name = "outputs"
  help = "Resolves and returns the outputs of the project."

  workflows = true

  description = dedent`
    Resolves and returns the outputs of the project. If necessary, this may involve deploying services and/or running
    tasks referenced by the outputs in the project configuration.

    Examples:

        garden get outputs                 # resolve and print the outputs from the project
        garden get outputs --env=prod      # resolve and print the outputs from the project for the prod environment
        garden get outputs --output=json   # resolve and return the project outputs in JSON format
  `

  outputsSchema = () => joiVariables().description("A map of all the defined project outputs, fully resolved.")

  async prepare({ headerLog }: PrepareParams) {
    printHeader(headerLog, "Resolving project outputs", "notebook")
    return { persistent: false }
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult<PrimitiveMap>> {
    const outputs = await resolveProjectOutputs(garden, log)

    const rows = [
      { [chalk.bold("Name:")]: [chalk.bold("Value:")] },
      ...outputs.map((o) => ({ [chalk.cyan.bold(o.name)]: [o.value?.toString().trim()] })),
    ]
    log.info("")
    log.info(chalk.white.bold("Outputs:"))
    log.info(renderTable(rows))

    return { result: fromPairs(outputs.map((o) => [o.name, o.value])) }
  }
}
