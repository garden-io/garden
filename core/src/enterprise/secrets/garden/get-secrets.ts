/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { got, GotResponse } from "../../../util/http"
import { GetSecretsParams } from ".."
import { StringMap } from "../../../config/common"
import { authTokenHeader } from "../../auth"

export async function getSecretsFromGardenEnterprise({
  log,
  projectId,
  enterpriseDomain,
  clientAuthToken,
  environmentName,
}: GetSecretsParams): Promise<StringMap> {
  const entry = log.info({ msg: chalk.cyan("Fetching secrets"), status: "active" })
  try {
    const url = `${enterpriseDomain}/secrets/projectUid/${projectId}/env/${environmentName}`
    const headers = { [authTokenHeader]: clientAuthToken }
    const res = await got(url, { headers }).json<GotResponse<any>>()
    if (res && res["status"] === "success") {
      entry.setSuccess({ msg: chalk.green("Done"), append: true })
      return res["data"]
    }
    return {}
  } catch (err) {
    log.error("")
    log.error("An error occurred while fetching secrets for the project:")
    log.error("")
    log.error(err.message)
    log.error("")
    entry.setError({ msg: "Error", append: true })
    return {}
  }
}
