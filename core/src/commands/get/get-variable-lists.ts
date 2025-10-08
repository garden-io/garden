/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "../base.js"
import { Command } from "../base.js"
import { printEmoji, printHeader } from "../../logger/util.js"
import { dedent, renderTable } from "../../util/string.js"
import { styles } from "../../logger/styles.js"
import { joi, joiArray } from "../../config/common.js"
import { ConfigurationError } from "../../exceptions.js"
import { getCloudListCommandBaseDescription, noApiMsg, throwIfLegacyCloud } from "../helpers.js"
import { makeDocsLinkPlain } from "../../docs/common.js"

const getVariableListsOpts = {}

type Opts = typeof getVariableListsOpts

export class GetVariableListsCommand extends Command<{}, Opts> {
  name = "variable-lists"
  help = "Get variable lists"
  emoji = "☁️"

  override description = dedent`
    ${getCloudListCommandBaseDescription("variable lists")}

    Variable lists are used to group together remote variables and this command can be used to get
    the variable list IDs that are needed for the \`garden create cloud-variables\` command.

    Examples:
        garden get variable-lists                 # list variable lists and pretty print results
        garden get variable-lists --output json   # returns variable lists as a JSON object, useful for scripting

    See the [Variables and Templating guide](${makeDocsLinkPlain`features/variables-and-templating`}) for more information.

  `

  override options = getVariableListsOpts

  override printHeader({ log }) {
    printHeader(log, "Get variable lists", "☁️")
  }

  override outputsSchema = () =>
    joi.object().keys({
      variableLists: joiArray(
        joi.object().keys({
          name: joi.string(),
          id: joi.string(),
          description: joi.string(),
        })
      ).description("A list of variable lists"),
    })

  async action({ garden, log }: CommandParams<{}, Opts>): Promise<CommandResult> {
    throwIfLegacyCloud(garden)

    if (!garden.cloudApi) {
      throw new ConfigurationError({ message: noApiMsg("create", "variables") })
    }

    log.debug("Fetching variable lists from organization")
    const response = await garden.cloudApi.trpc.variableList.list.query({
      organizationId: garden.cloudApi.organizationId,
    })

    const variableLists = response.map((list) => ({
      name: list.name,
      id: list.id,
      description: list.description,
    }))

    const heading = ["Name", "ID", "Description"].map((s) => styles.bold(s))
    const rows: string[][] = variableLists.map((vl) => {
      return [vl.name, vl.id, vl.description]
    })

    log.info("")
    log.info(renderTable([heading].concat(rows)))
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return { result: { variableLists } }
  }
}
