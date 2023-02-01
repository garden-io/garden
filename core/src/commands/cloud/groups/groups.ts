/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ListGroupsResponse } from "@garden-io/platform-api-types"
import chalk from "chalk"
import { sortBy } from "lodash"
import { StringsParameter } from "../../../cli/params"
import { ConfigurationError } from "../../../exceptions"
import { printHeader } from "../../../logger/util"
import { dedent, deline, renderTable } from "../../../util/string"
import { Command, CommandGroup, CommandParams, CommandResult } from "../../base"
import { noApiMsg, applyFilter } from "../helpers"

// TODO: Add created at and updated at timestamps. Need to add it to the API response first.
interface Groups {
  id: number
  name: string
  description: string
  defaultAdminGroup: boolean
}

export class GroupsCommand extends CommandGroup {
  name = "groups"
  help = "List groups."

  subCommands = [GroupsListCommand]
}

export const groupsListOpts = {
  "filter-names": new StringsParameter({
    help: deline`Filter on group name. Use comma as a separator to filter on multiple names. Accepts glob patterns.`,
  }),
}

type Opts = typeof groupsListOpts

export class GroupsListCommand extends Command<{}, Opts> {
  name = "list"
  help = "List groups."
  description = dedent`
    List all groups from Garden Cloud. This is useful for getting the group IDs when creating
    users via the \`garden cloud users create\` command.

    Examples:
        garden cloud groups list                       # list all groups
        garden cloud groups list --filter-names dev-*  # list all groups that start with 'dev-'
  `

  options = groupsListOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "List groups", "balloon")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<Groups[]>> {
    const nameFilter = opts["filter-names"] || []

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("list", "users"), {})
    }

    const res = await api.get<ListGroupsResponse>("/groups")
    const groups: Groups[] = res.data.map((group) => ({
      name: group.name,
      id: group.id,
      description: group.description,
      defaultAdminGroup: group.defaultAdminGroup,
    }))

    log.info("")

    if (groups.length === 0) {
      log.info("No groups found in project.")
      return { result: [] }
    }

    const filtered = sortBy(groups, "name").filter((user) => applyFilter(nameFilter, user.name))

    if (filtered.length === 0) {
      log.info("No groups found in project that match filters.")
      return { result: [] }
    }

    log.debug(`Found ${filtered.length} groups that match filters`)

    const heading = ["Name", "ID", "Default Admin Group"].map((s) => chalk.bold(s))
    const rows: string[][] = filtered.map((g) => [chalk.cyan.bold(g.name), String(g.id), String(g.defaultAdminGroup)])

    log.info(renderTable([heading].concat(rows)))

    return { result: filtered }
  }
}
