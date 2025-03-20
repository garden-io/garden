/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
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
import { confirmDelete, handleBulkOperationResult, noApiMsg } from "../helpers.js"
import { enumerate } from "../../../util/enumerate.js"
import { handleSecretsUnavailableInNewBackend } from "../../../cloud/secrets.js"

export const secretsDeleteArgs = {
  ids: new StringsParameter({
    help: deline`The ID(s) of the secrets to delete.`,
    spread: true,
  }),
}

type Args = typeof secretsDeleteArgs

export class SecretsDeleteCommand extends Command<Args> {
  name = "delete"
  help = "Delete secrets from Garden Cloud."
  override description = dedent`
    Delete secrets in Garden Cloud. You will need the IDs of the secrets you want to delete,
    which you which you can get from the \`garden cloud secrets list\` command.

    Examples:
        garden cloud secrets delete <ID 1> <ID 2> <ID 3>   # delete three secrets with the given IDs.
  `

  override arguments = secretsDeleteArgs

  override printHeader({ log }) {
    printHeader(log, "Delete secrets", "🔒")
  }

  async action({ garden, args, log, opts }: CommandParams<Args>): Promise<CommandResult<DeleteResult[]>> {
    handleSecretsUnavailableInNewBackend(garden)

    const secretsToDelete = args.ids || []
    if (secretsToDelete.length === 0) {
      throw new CommandError({
        message: `No secret IDs provided.`,
      })
    }

    if (!opts.yes && !(await confirmDelete("secret", secretsToDelete.length))) {
      return {}
    }

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("delete", "secrets") })
    }

    const cmdLog = log.createLog({ name: "secrets-command" })
    cmdLog.info("Deleting secrets...")

    const errors: ApiCommandError[] = []
    const results: DeleteResult[] = []
    for (const [counter, id] of enumerate(secretsToDelete, 1)) {
      cmdLog.info({ msg: `Deleting secrets... → ${counter}/${secretsToDelete.length}` })
      try {
        const res = await api.delete<BaseResponse>(`/secrets/${id}`)
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
      resource: "secret",
      results,
    })
  }
}
