/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { got, GotResponse } from "../../../util/http"
import { GetSecretsParams } from ".."
import { StringMap } from "../../../config/common"

export async function getSecretsFromGardenCloud({
  log,
  projectId,
  cloudDomain,
  clientAuthToken,
  environmentName,
}: GetSecretsParams): Promise<StringMap> {
  try {
    const url = `${cloudDomain}/secrets/projectUid/${projectId}/env/${environmentName}`
    const headers = { "x-access-auth-token": clientAuthToken }
    const res = await got(url, { headers }).json<GotResponse<any>>()
    if (res && res["status"] === "success") {
      return res["data"]
    }
    return {}
  } catch (err) {
    log.error("An error occurred while fetching secrets for the project.")
    return {}
  }
}
