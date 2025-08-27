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
import { noApiMsg, throwIfLegacyCloud } from "../helpers.js"

const getUsersOpts = {}

type Opts = typeof getUsersOpts

export class GetUsersCommand extends Command<{}, Opts> {
  name = "users"
  help = "Get users"
  emoji = "👤"

  override description = dedent`
    List the users for this organization.
  `

  override options = getUsersOpts

  override printHeader({ log }) {
    printHeader(log, "Get users", "👤")
  }

  override outputsSchema = () =>
    joi.object().keys({
      users: joiArray(
        joi.object().keys({
          name: joi.string(),
          id: joi.string(),
          email: joi.string(),
          role: joi.string(),
        })
      ).description("A list of users"),
    })

  async action({ garden, log }: CommandParams<{}, Opts>): Promise<CommandResult> {
    throwIfLegacyCloud(garden, "garden cloud users list")

    if (!garden.cloudApi) {
      throw new ConfigurationError({ message: noApiMsg("get", "users") })
    }

    const allUsers: any[] = []
    let cursor: number | undefined = undefined

    do {
      log.debug("Fetching users from organization")
      const response = await garden.cloudApi.trpc.account.list.query({
        organizationId: garden.cloudApi.organizationId,
        ...(cursor && { cursor }),
      })

      allUsers.push(...response.items)
      cursor = response.nextCursor
    } while (cursor)

    const users = allUsers.map((user) => ({
      name: user.name || user.email,
      id: user.id,
      email: user.email,
      role: user.role,
    }))

    const heading = ["Name", "ID", "Email", "Role"].map((s) => styles.bold(s))
    const rows: string[][] = users.map((u) => {
      return [u.name, u.id, u.email, u.role]
    })

    log.info("")
    log.info(renderTable([heading].concat(rows)))
    log.info(styles.success("OK") + " " + printEmoji("✔️", log))

    return { result: { users } }
  }
}
