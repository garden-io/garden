/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../../logger/log-entry"
import { StringMap } from "../../config/common"
import { EnterpriseApi } from "../api"

export interface GetSecretsParams {
  log: LogEntry
  projectId: string
  enterpriseApi: EnterpriseApi
  clientAuthToken: string
  environmentName: string
}

export async function getSecrets(params: GetSecretsParams): Promise<StringMap> {
  const { log, enterpriseApi, projectId, environmentName } = params
  let secrets = {}
  try {
    const res = await enterpriseApi.get(log, `/secrets/projectUid/${projectId}/env/${environmentName}`)
    if (res && res["status"] === "success") {
      secrets = res["data"]
    }
  } catch (err) {
    log.error("An error occurred while fetching secrets for the project.")
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
