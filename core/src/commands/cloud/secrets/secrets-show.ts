/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { printHeader } from "../../../logger/util"
import { dedent, deline, renderTable } from "../../../util/string"
import { Command, CommandParams, CommandResult } from "../../base"
import { applyFilter, noApiMsg, SecretResult } from "../helpers"
import chalk from "chalk"
import { sortBy } from "lodash"
import { StringsParameter } from "../../../cli/params"
import { ConfigurationError } from "../../../exceptions"

interface SecretShowResult {
  name: string
  value: string
}

const secretsShowOpts = {
  "filter-names": new StringsParameter({
    help: deline`Filter on secret name. Use comma as a separator to filter on multiple secret names. Accepts glob patterns.`,
  }),
}

const secretsShowArgs = {
  name: new StringsParameter({
    help: deline`Name of the secret to show.`,
  }),
}

type Opts = typeof secretsShowOpts

export class SecretsShowCommand extends Command<{}, Opts> {
  name = "show"
  help = "[EXPERIMENTAL] Show secrets."
  description = dedent`
    Show all secrets from Garden Cloud for the given project, environment and user triplet.

    Note that secrets can be scoped to a project, scoped to a project and an environment, or
    scoped to a project, an environment, and a user. Garden resolves secrets in that precedence
    order and it's not possible to view secrets out of that scope. You cannot e.g. view secrets
    from another user unless you assume their role.

    Examples:
        garden cloud secrets show                                          # show all secrets
        garden cloud secrets show --filter-names DB_*                      # show all secrets that start with DB_
  `

  options = secretsShowOpts

  printHeader({ headerLog }) {
    printHeader(headerLog, "Show secrets", "lock")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult<SecretShowResult[]>> {
    const nameFilter = opts["filter-names"] || []

    if (!garden.cloudApi) {
      throw new ConfigurationError(noApiMsg("show", "secrets"), {})
    }

    const secrets = Object.entries(garden.secrets).map(([name, value]) => ({
      name,
      value,
    }))

    log.info("")

    if (secrets.length === 0) {
      log.info("No secrets found in project.")
      return { result: [] }
    }

    const filtered = sortBy(secrets, "name").filter((secret) => applyFilter(nameFilter, secret.name))

    if (filtered.length === 0) {
      log.info("No secrets found in project that match filters.")
      return { result: [] }
    }

    log.debug(`Found ${filtered.length} secrets that match filters`)

    const heading = ["Name", "Value"].map((s) => chalk.bold(s))
    const rows: string[][] = filtered.map((s) => {
      return [chalk.cyan.bold(s.name), s.value]
    })

    log.info(renderTable([heading].concat(rows)))

    return { result: filtered }
  }
}
