/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger/log-entry"
import { StringMap } from "../config/common"
import { EnterpriseApi, isGotError } from "./api"
import { BaseResponse } from "@garden-io/platform-api-types"
import { deline } from "../util/string"

export interface GetSecretsParams {
  log: LogEntry
  environmentName: string
  enterpriseApi: EnterpriseApi
}

export async function getSecrets({ log, environmentName, enterpriseApi }: GetSecretsParams): Promise<StringMap> {
  let secrets: StringMap = {}

  try {
    const res = await enterpriseApi.get<BaseResponse>(
      `/secrets/projectUid/${enterpriseApi.projectId}/env/${environmentName}`
    )
    secrets = res.data
  } catch (err) {
    if (isGotError(err, 404)) {
      log.debug("No secrets were received from Garden Enterprise.")
      log.debug("")
      log.debug(deline`
        Either the environment ${environmentName} does not exist in Garden Enterprise, or no project
        with the id in your project configuration exists in Garden Enterprise.
      `)
      log.debug("")
      log.debug(deline`
        Please visit ${enterpriseApi.domain} to review the environments and projects currently
        in the system.
      `)
    } else {
      log.error("An error occurred while fetching secrets for the project.")
      throw err
    }
  }

  const emptyKeys = Object.keys(secrets).filter((key) => !secrets[key])
  if (emptyKeys.length > 0) {
    const prefix =
      emptyKeys.length === 1
        ? "The following secret key has an empty value"
        : "The following secret keys have empty values"
    log.error(`${prefix}: ${emptyKeys.sort().join(", ")}`)
  }
  return secrets
}
