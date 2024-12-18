/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_GROW_CLOUD_DOMAIN, gardenEnv } from "../../constants.js"

export type GrowCloudDistroName = "Garden Cloud V2"

export function getGrowCloudDistributionName(): GrowCloudDistroName {
  return "Garden Cloud V2"
}

export type GrowCloudLogSectionName = "garden-cloud-v2"

export function getGrowCloudLogSectionName(): GrowCloudLogSectionName {
  return "garden-cloud-v2"
}

export function getGrowCloudDomain(configuredDomain: string | undefined): string {
  let cloudDomain: string | undefined

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    cloudDomain = new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (configuredDomain) {
    cloudDomain = new URL(configuredDomain).origin
  }

  return cloudDomain || DEFAULT_GROW_CLOUD_DOMAIN
}
