/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getGrowCloudDistributionName } from "./grow/util.js"
import { gardenEnv } from "../constants.js"
import { GardenError } from "../exceptions.js"

class SecretsUnavailableInNewBackend extends GardenError {
  override type = "secrets-unavailable-in-new-backend"
}

export function getSecretsUnavailableInNewBackendMessage({ cloudBackendDomain }: { cloudBackendDomain: string }) {
  if (!gardenEnv.USE_GARDEN_CLOUD_V2) {
    return undefined
  }

  return `This version of Garden does not support secrets together with ${getGrowCloudDistributionName()} (${cloudBackendDomain})`
}

export function handleSecretsUnavailableInNewBackend({ cloudBackendDomain }: { cloudBackendDomain: string }) {
  const unavailableMessage = getSecretsUnavailableInNewBackendMessage({ cloudBackendDomain })

  if (unavailableMessage) {
    throw new SecretsUnavailableInNewBackend({
      message: unavailableMessage,
    })
  }
}
