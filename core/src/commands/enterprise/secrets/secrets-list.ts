/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { stringify } from "query-string"
import { ConfigurationError } from "../../../exceptions"
import { ListSecretsResponse } from "@garden-io/platform-api-types"

import { printHeader } from "../../../logger/util"
import { dedent, deline, renderTable } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { applyFilter, getProject, makeSecretFromResponse, noApiMsg, SecretResult } from "../helpers"
import chalk from "chalk"
import { sortBy } from "lodash"
import { StringsParameter } from "../../../cli/params"

export const secretsListOpts = {
  "filter-envs": new StringsParameter({
    help: deline`Filter on environment. Use comma as a separator to filter on multiple environments.
    Accepts glob patterns."`,
  }),
  "filter-user-ids": new StringsParameter({
    help: deline`Filter on user ID. Use comma as a separator to filter on multiple user IDs. Accepts glob patterns.`,
  }),
  "filter-names": new StringsParameter({
    help: deline`Filter on secret name. Use comma as a separator to filter on multiple secret names. Accepts glob patterns.`,
  }),
}

type Opts = typeof secretsListOpts

export class SecretsListCommand extends Command<{}, Opts> {
  name = "list"
  help = "[EXPERIMENTAL] List secrets."
  description = dedent`
    List all secrets from Garden Enterprise. Optionally filter on environment, user IDs, or secret names.

    Examples:
        garden enterprise secrets list                                          # list all secrets
        garden enterprise secrets list --filter-envs dev                        # list all secrets from the dev environment
        garden enterprise secrets list --filter-envs dev --filter-names *_DB_*  # list all secrets from the dev environment that have '_DB_' in their name.
  `

  options = secretsListOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "List secrets", "lock")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<SecretResult[]>> {
    const envFilter = opts["filter-envs"] || []
    const nameFilter = opts["filter-names"] || []
    const userFilter = opts["filter-user-ids"] || []

    const api = garden.enterpriseApi
    if (!api) {
      throw new ConfigurationError(noApiMsg("list", "secrets"), {})
    }

    const project = await getProject(api, api.projectId)

    const q = stringify({ projectId: project.id })
    const res = await api.get<ListSecretsResponse>(`/secrets?${q}`)
    const secrets = res.data.map((secret) => makeSecretFromResponse(secret))

    log.info("")

    if (secrets.length === 0) {
      log.info("No secrets found in project.")
      return { result: [] }
    }

    const filtered = sortBy(secrets, "name")
      .filter((secret) => applyFilter(envFilter, secret.environment?.name))
      .filter((secret) => applyFilter(userFilter, String(secret.user?.id)))
      .filter((secret) => applyFilter(nameFilter, secret.name))

    if (filtered.length === 0) {
      log.info("No secrets found in project that match filters.")
      return { result: [] }
    }

    const heading = ["Name", "ID", "Environment", "User", "Created At"].map((s) => chalk.bold(s))
    const rows: string[][] = filtered.map((s) => {
      return [
        chalk.cyan.bold(s.name),
        String(s.id),
        s.environment?.name || "[none]",
        s.user?.name || "[none]",
        new Date(s.createdAt).toUTCString(),
      ]
    })

    log.info(renderTable([heading].concat(rows)))

    return { result: filtered }
  }
}
