/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ListGroupsResponse } from "@garden-io/platform-api-types"
import { sortBy } from "lodash-es"
import { StringsParameter } from "../../../cli/params.js"
import { ConfigurationError } from "../../../exceptions.js"
import { printHeader } from "../../../logger/util.js"
import { dedent, deline, renderTable } from "../../../util/string.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command, CommandGroup } from "../../base.js"
import { noApiMsg, applyFilter } from "../helpers.js"
import { styles } from "../../../logger/styles.js"

// TODO: Add created at and updated at timestamps. Need to add it to the API response first.
interface Groups {
  id: string
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
    help: deline`Filter on group name. You may filter on multiple names by setting this flag multiple times. Accepts glob patterns.`,
    spread: true,
  }),
}

type Opts = typeof groupsListOpts

export class GroupsListCommand extends Command<{}, Opts> {
  name = "list"
  help = "List groups defined in Garden Cloud."
  override description = dedent`
    List all groups from Garden Cloud. This is useful for getting the group IDs when creating
    users via the \`garden cloud users create\` command.

    Examples:
        garden cloud groups list                       # list all groups
        garden cloud groups list --filter-names dev-*  # list all groups that start with 'dev-'
  `

  override options = groupsListOpts

  override printHeader({ log }) {
    printHeader(log, "List groups", "")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<Groups[]>> {
    const nameFilter = opts["filter-names"] || []

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("list", "users") })
    }

    const res = await api.get<ListGroupsResponse>(`/groups`)
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

    const heading = ["Name", "ID", "Default Admin Group"].map((s) => styles.bold(s))
    const rows: string[][] = filtered.map((g) => {
      return [styles.highlight.bold(g.name), String(g.id), String(g.defaultAdminGroup)]
    })

    log.info(renderTable([heading].concat(rows)))

    return { result: filtered }
  }
}
