/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { BaseResponse } from "@garden-io/platform-api-types"
import { StringsParameter } from "../../../cli/params.js"
import { CommandError, ConfigurationError, GardenError } from "../../../exceptions.js"
import { printHeader } from "../../../logger/util.js"
import { dedent, deline } from "../../../util/string.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command } from "../../base.js"
import type { ApiCommandError, DeleteResult } from "../helpers.js"
import { confirmDelete } from "../helpers.js"
import { enumerate } from "../../../util/enumerate.js"
import { handleBulkOperationResult, noApiMsg, throwIfNotLegacyCloud } from "../../helpers.js"

export const usersDeleteArgs = {
  ids: new StringsParameter({
    help: deline`The IDs of the users to delete.`,
    spread: true,
  }),
}

type Args = typeof usersDeleteArgs

export class UsersDeleteCommand extends Command<Args> {
  name = "delete"
  help = "Delete users from Garden Cloud."
  override description = dedent`
    Delete users in Garden Cloud. You will need the IDs of the users you want to delete,
    which you which you can get from the \`garden cloud users list\` command. Use a comma-
    separated list to delete multiple users.

    Examples:
        garden cloud users delete <ID 1> <ID 2> <ID 3>   # delete three users with the given IDs.
  `

  override arguments = usersDeleteArgs

  override printHeader({ log }) {
    printHeader(log, "Delete users", "🔒")
  }

  async action({ garden, args, log, opts }: CommandParams<Args>): Promise<CommandResult<DeleteResult[]>> {
    throwIfNotLegacyCloud(garden)

    const usersToDelete = args.ids || []
    if (usersToDelete.length === 0) {
      throw new CommandError({
        message: `No user IDs provided.`,
      })
    }

    if (!opts.yes && !(await confirmDelete("user", usersToDelete.length))) {
      return {}
    }

    const api = garden.cloudApiLegacy
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("delete", "user") })
    }

    const cmdLog = log.createLog({ name: "users-command" })
    cmdLog.info("Deleting users...")

    const errors: ApiCommandError[] = []
    const results: DeleteResult[] = []
    for (const [counter, id] of enumerate(usersToDelete, 1)) {
      cmdLog.info({ msg: `Deleting users... → ${counter}/${usersToDelete.length}` })
      try {
        const res = await api.delete<BaseResponse>(`/users/${id}`)
        results.push({ id, status: res.status })
      } catch (err) {
        if (!(err instanceof GardenError)) {
          throw err
        }
        errors.push({
          identifier: id,
          message: err.message,
        })
      }
    }

    return handleBulkOperationResult({
      log,
      cmdLog,
      errors,
      action: "delete",
      resource: "user",
      results,
    })
  }
}
