/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenError } from "../exceptions.js"
import type { Garden } from "../index.js"
import { getBackendType, getCloudDistributionName } from "./util.js"

class SecretsUnavailableInNewBackend extends GardenError {
  override type = "secrets-unavailable-in-new-backend"
}

export function getSecretsUnavailableInNewBackendMessage(cloudBackendDomain: string) {
  return `This version of Garden does not support secrets together with ${getCloudDistributionName(cloudBackendDomain)} (${cloudBackendDomain})`
}

export function handleSecretsUnavailableInNewBackend(garden: Garden) {
  if (getBackendType(garden.getProjectConfig()) === "v2") {
    throw new SecretsUnavailableInNewBackend({
      message: getSecretsUnavailableInNewBackendMessage(garden.cloudDomain),
    })
  }
}
