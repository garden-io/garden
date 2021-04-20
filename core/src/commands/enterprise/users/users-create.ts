/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandError, ConfigurationError } from "../../../exceptions"
import { CreateUserBulkRequest, CreateUserBulkResponse, UserResponse } from "@garden-io/platform-api-types"
import dotenv = require("dotenv")
import { readFile } from "fs-extra"

import { printHeader } from "../../../logger/util"
import { Command, CommandParams, CommandResult } from "../../base"
import { ApiCommandError, handleBulkOperationResult, makeUserFromResponse, noApiMsg, UserResult } from "../helpers"
import { dedent, deline } from "../../../util/string"
import { StringsParameter, PathParameter } from "../../../cli/params"
import { StringMap } from "../../../config/common"
import { chunk } from "lodash"
import Bluebird = require("bluebird")

// This is the limit set by the API.
const MAX_USERS_PER_REQUEST = 100

export const secretsCreateArgs = {
  users: new StringsParameter({
    help: deline`The VCS usernames and the names of the users to create, separated by '='.
      Use comma as a separator to specify multiple VCS username/name pairs. Note
      that you can also leave this empty and have Garden read the users from file.`,
  }),
}

export const secretsCreateOpts = {
  "add-to-groups": new StringsParameter({
    help: deline`Add the user to the group with the given ID. Use comma as a separator to add the user to multiple groups.`,
  }),
  "from-file": new PathParameter({
    help: deline`Read the users from the file at the given path. The file should have standard "dotenv"
    format (as defined by [dotenv](https://github.com/motdotla/dotenv#rules)) where the VCS username is the key and the
    name is the value.`,
  }),
}

type Args = typeof secretsCreateArgs
type Opts = typeof secretsCreateOpts

export class UsersCreateCommand extends Command<Args, Opts> {
  name = "create"
  help = "[EXPERIMENTAL] Create users"
  description = dedent`
    Create users in Garden Enterprise and optionally add the users to specific groups.
    You can get the group IDs from the \`garden enterprise users list\` command.

    To create a user, you'll need their GitHub or GitLab username, depending on which one is your VCS provider, and the name
    they should have in Garden Enterprise. Note that it **must** the their GitHub/GitLab username, not their email, as people
    can have several emails tied to their GitHub/GitLab accounts.

    You can optionally read the users from a file. The file must have the format vcs-username="Actual Username". For example:

    fatema_m="Fatema M"
    gordon99="Gordon G"

    Examples:
        garden enterprise users create fatema_m="Fatema M",gordon99="Gordon G"      # create two users
        garden enterprise users create fatema_m="Fatema M" --add-to-groups 1,2  # create a user and add two groups with IDs 1,2
        garden enterprise users create --from-file /path/to/users.txt           # create users from the key value pairs in the users.txt file
  `

  arguments = secretsCreateArgs
  options = secretsCreateOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Create users", "lock")
  }

  async action({ garden, log, opts, args }: CommandParams<Args, Opts>): Promise<CommandResult<UserResult[]>> {
    const addToGroups = (opts["add-to-groups"] || []).map((groupId) => parseInt(groupId, 10))
    const fromFile = opts["from-file"] as string | undefined
    let users: StringMap

    if (fromFile) {
      try {
        users = dotenv.parse(await readFile(fromFile))
      } catch (err) {
        throw new CommandError(`Unable to read users from file at path ${fromFile}: ${err.message}`, {
          args,
          opts,
        })
      }
    } else if (args.users) {
      users = args.users.reduce((acc, keyValPair) => {
        const parts = keyValPair.split("=")
        acc[parts[0]] = parts[1]
        return acc
      }, {})
    } else {
      throw new CommandError(
        dedent`
        No users provided. Either provide users directly to the command or via the --from-file flag.
      `,
        { args, opts }
      )
    }

    const api = garden.enterpriseApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("create", "users"), {})
    }

    const cmdLog = log.info({ status: "active", section: "users-command", msg: "Creating users..." })

    const usersToCreate = Object.entries(users).map(([vcsUsername, name]) => ({
      name,
      vcsUsername,
    }))
    const batches = chunk(usersToCreate, MAX_USERS_PER_REQUEST)
    // This pretty arbitrary, but the bulk action can create 100 users at a time
    // so the queue shouldn't ever get very long.
    const concurrency = 2
    const nAsyncBatches = Math.ceil(batches.length / concurrency)
    let currentAsyncBatch = 0
    let count = 1

    const errors: ApiCommandError[] = []
    const results: UserResult[] = []
    await Bluebird.map(
      batches,
      async (userBatch) => {
        const asyncBatch = Math.ceil(count / nAsyncBatches)
        if (asyncBatch > currentAsyncBatch) {
          currentAsyncBatch = asyncBatch
          cmdLog.setState({ msg: `Creating users... → Batch ${currentAsyncBatch}/${nAsyncBatches}` })
        }
        count++
        try {
          const body: CreateUserBulkRequest = {
            users: userBatch,
            addToGroups,
          }
          const res = await api.post<CreateUserBulkResponse>(`/users/bulk`, { body })
          const successes = res.data.filter((d) => d.statusCode === 200).map((d) => d.user) as UserResponse[]
          results.push(...successes.map((s) => makeUserFromResponse(s)))

          const failures = res.data
            .filter((d) => d.statusCode !== 200)
            .map((d) => ({
              message: d.message,
              identifier: d.user.vcsUsername,
            }))
          errors.push(...failures)
        } catch (err) {
          errors.push({
            identifier: "",
            message: err?.response?.body?.message || err.messsage,
          })
        }
      },
      { concurrency }
    )

    return handleBulkOperationResult({
      log,
      cmdLog,
      errors,
      action: "create",
      resource: "user",
      results,
    })
  }
}
