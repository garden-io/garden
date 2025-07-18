/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ConfigurationError } from "../../../exceptions.js"
import { printHeader } from "../../../logger/util.js"
import { dedent, deline, renderTable } from "../../../util/string.js"
import type { CommandParams, CommandResult } from "../../base.js"
import { Command } from "../../base.js"
import { applyFilter, noApiMsg } from "../helpers.js"
import { sortBy } from "lodash-es"
import { StringsParameter } from "../../../cli/params.js"
import { styles } from "../../../logger/styles.js"
import type { SecretResult } from "./secret-helpers.js"
import { makeSecretFromResponse } from "./secret-helpers.js"
import { handleSecretsUnavailableInNewBackend } from "../../../cloud/grow/secrets.js"

export const secretsListOpts = {
  "filter-envs": new StringsParameter({
    help: deline`Filter on environment. You may filter on multiple environments by setting this flag multiple times.
    Accepts glob patterns."`,
  }),
  "filter-user-ids": new StringsParameter({
    help: deline`Filter on user ID. You may filter on multiple user IDs by setting this flag multiple times. Accepts glob patterns.`,
  }),
  "filter-names": new StringsParameter({
    help: deline`Filter on secret name. You may filter on multiple secret names by setting this flag multiple times. Accepts glob patterns.`,
  }),
}

type Opts = typeof secretsListOpts

export class SecretsListCommand extends Command<{}, Opts> {
  name = "list"
  help = "List secrets defined in Garden Cloud."
  override description = dedent`
    List all secrets from Garden Cloud. Optionally filter on environment, user IDs, or secret names.

    Examples:
        garden cloud secrets list                                          # list all secrets
        garden cloud secrets list --filter-envs dev                        # list all secrets from the dev environment
        garden cloud secrets list --filter-envs dev --filter-names *_DB_*  # list all secrets from the dev environment that have '_DB_' in their name.
  `

  override options = secretsListOpts

  override printHeader({ log }) {
    printHeader(log, "List secrets", "🔒")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<SecretResult[]>> {
    handleSecretsUnavailableInNewBackend(garden)

    const envFilter = opts["filter-envs"] || []
    const nameFilter = opts["filter-names"] || []
    const userFilter = opts["filter-user-ids"] || []

    const api = garden.cloudApi
    if (!api) {
      throw new ConfigurationError({ message: noApiMsg("list", "secrets") })
    }

    const project = await api.getProjectByIdOrThrow({
      projectId: garden.projectId,
      projectName: garden.projectName,
    })

    const secrets = await api.fetchAllSecrets(project.id, log)
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

    log.debug(`Found ${filtered.length} secrets that match filters`)

    const heading = ["Name", "ID", "Environment", "User", "Created At"].map((s) => styles.bold(s))
    const rows: string[][] = filtered.map((s) => {
      return [
        styles.highlight.bold(s.name),
        String(s.id),
        s.environment?.name || "[none]",
        s.user?.name || "[none]",
        new Date(s.createdAt).toUTCString(),
      ]
    })

    log.info(renderTable([heading].concat(rows)))

    return { result: filtered.map(makeSecretFromResponse) }
  }
}
