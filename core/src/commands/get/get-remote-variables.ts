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
import { getVarlistIdsFromRemoteVarsConfig } from "../../config/project.js"
import type { RouterOutput } from "../../cloud/api/trpc.js"
import type { EmptyObject } from "type-fest"

const getRemoteVariablesOpts = {}

type Opts = typeof getRemoteVariablesOpts

interface RemoteVariable {
  name: string
  id: string
  value: string
  isSecret: boolean
  variableListName: string
  scopedToEnvironment: string
  scopedToUser: string
  expiresAt: string
  description: string
  scopedAccountId: string | null
  scopedEnvironmentId: string | null
}

export class GetRemoteVariablesCommand extends Command<EmptyObject, Opts> {
  name = "remote-variables"
  help = "Get remote variables from Garden Cloud"
  emoji = "☁️"

  override aliases = ["cloud-variables"]

  override description = dedent`
    ${getCloudListCommandBaseDescription("remote variables")}

    List all remote variables for the variable lists configured in this project. This is useful for
    seeing the IDs of remote variables (e.g. for use with the \`garden delete remote-variables\` command)
    and for viewing cloud-specific information such as scoping and expiration.

    Examples:
        garden get remote-variables                 # list remote variables and pretty print results
        garden get remote-variables --output json   # returns remote variables as a JSON object, useful for scripting

    See the [Variables and Templating guide](${makeDocsLinkPlain`features/variables-and-templating`}) for more information.

  `

  override options = getRemoteVariablesOpts

  override printHeader({ log }) {
    printHeader(log, "Get remote variables", "☁️")
  }

  override outputsSchema = () =>
    joi.object().keys({
      variables: joiArray(
        joi.object().keys({
          name: joi.string(),
          id: joi.string(),
          value: joi.string(),
          isSecret: joi.boolean(),
          variableListName: joi.string(),
          environmentScope: joi.string(),
          userScope: joi.string(),
          expiresAt: joi.string().allow(""),
          description: joi.string(),
        })
      ).description("A list of remote variables"),
    })

  async action({
    garden,
    log,
  }: CommandParams<EmptyObject, Opts>): Promise<CommandResult<{ variables: RemoteVariable[] }>> {
    throwIfLegacyCloud(garden, "garden cloud variables list")

    if (!garden.cloudApi) {
      throw new ConfigurationError({ message: noApiMsg("get", "cloud variables") })
    }

    const config = await garden.dumpConfigWithInteralFields({
      log,
      includeDisabled: false,
      resolveGraph: false,
      resolveProviders: false,
      resolveWorkflows: false,
    })

    const variableListIds = getVarlistIdsFromRemoteVarsConfig(config.importVariables)

    if (variableListIds.length === 0) {
      log.info("No variable lists configured in this project.")
      return { result: { variables: [] } }
    }

    const allVariables: RouterOutput["variableList"]["listVariables"]["items"] = []

    for (const variableListId of variableListIds) {
      let cursor: number | undefined = undefined

      do {
        log.debug(`Fetching variables for variable list ${variableListId}`)
        const response = await garden.cloudApi.trpc.variableList.listVariables.query({
          organizationId: garden.cloudApi.organizationId,
          variableListId,
          ...(cursor && { cursor }),
        })

        allVariables.push(...response.items)
        cursor = response.nextCursor
      } while (cursor)
    }

    const variables: RemoteVariable[] = allVariables.map((v) => ({
      name: v.name,
      id: v.id,
      value: v.isSecret ? "<secret>" : v.value,
      isSecret: v.isSecret,
      variableListName: v.variableListName || "N/A",
      scopedToEnvironment: v.scopedGardenEnvironmentName || "None",
      scopedToUser: v.scopedAccountName || "None",
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : "Never",
      description: v.description || "",
      scopedAccountId: v.scopedAccountId,
      scopedEnvironmentId: v.scopedGardenEnvironmentId,
    }))

    const heading = [
      "Name",
      "ID",
      "Value",
      "Variable List",
      "Environment Scope",
      "User Scope",
      "Expires At",
      "Secret",
    ].map((s) => styles.bold(s))

    const rows: string[][] = variables.map((v) => {
      return [
        styles.highlight.bold(v.name),
        v.id,
        v.value,
        v.variableListName,
        v.scopedToEnvironment,
        v.scopedToUser,
        v.expiresAt,
        v.isSecret ? "Yes" : "No",
      ]
    })

    log.info("")
    log.info(renderTable([heading].concat(rows)))
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return { result: { variables } }
  }
}
