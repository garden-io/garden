/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants.js"
import type { GrowCloudDistroName, GrowCloudLogSectionName } from "./grow/util.js"
import { getGrowCloudDomain } from "./grow/util.js"
import { getGrowCloudDistributionName, getGrowCloudLogSectionName } from "./grow/util.js"
import { InternalError } from "../exceptions.js"

export type GardenCloudDistroName = "the Garden dashboard" | "Garden Enterprise" | "Garden Cloud"

export type CloudDistroName = GardenCloudDistroName | GrowCloudDistroName

/**
 * Returns "Garden Cloud" if domain matches https://<some-subdomain>.app.garden,
 * otherwise "Garden Enterprise".
 *
 * TODO: Return the distribution type from the API and store on the CloudApi class.
 */
export function getGardenCloudDistributionName(domain: string): CloudDistroName {
  if (isGardenCommunityEdition(domain)) {
    return "the Garden dashboard"
  }

  // TODO: consider using URL object instead.
  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }

  return "Garden Cloud"
}

/**
 * Returns the name of the effective Cloud backend (either Grow or Garden).
 */
export function getCloudDistributionName(domain: string): CloudDistroName {
  if (gardenEnv.USE_GARDEN_CLOUD_V2) {
    return getGrowCloudDistributionName()
  }

  return getGardenCloudDistributionName(domain)
}

export type GardenCloudLogSectionName = "garden-dashboard" | "garden-cloud" | "garden-enterprise"
export type CloudLogSectionName = GardenCloudLogSectionName | GrowCloudLogSectionName

export function getCloudLogSectionName(distroName: CloudDistroName): CloudLogSectionName {
  if (distroName === "the Garden dashboard") {
    return "garden-dashboard"
  } else if (distroName === "Garden Cloud") {
    return "garden-cloud"
  } else if (distroName === "Garden Enterprise") {
    return "garden-enterprise"
  } else if (distroName === "Garden Cloud V2") {
    return getGrowCloudLogSectionName()
  } else {
    return distroName satisfies never
  }
}

/**
 * A helper function to get the cloud domain from a project config.
 * Uses the env var `GARDEN_CLOUD_DOMAIN` to override a configured domain.
 *
 * The cloud domain is resolved in the following order:
 *  - 1. GARDEN_CLOUD_DOMAIN config variable
 *  - 2. `domain`-field from the project config
 *  - 3. fallback to the default garden cloud domain
 *
 * If the fallback was used, we rely on the token to decide if the Cloud API instance
 * should use the default domain or not. The token lifecycle ends on logout.
 */
export function getGardenCloudDomain(configuredDomain: string | undefined): string {
  let cloudDomain: string | undefined

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    cloudDomain = new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (configuredDomain) {
    cloudDomain = new URL(configuredDomain).origin
  }

  return cloudDomain || DEFAULT_GARDEN_CLOUD_DOMAIN
}

/**
 * Chooses between {@link getGardenCloudDomain} and {@link getGrowCloudDomain}
 * depending on the `USE_GARDEN_CLOUD_V2` feature flag.
 *
 * To be used in login and logout commands for now.
 * Later we should use the right Cloud domain insode the Garden instance
 * and its CloudApi instance.
 */
export function getCloudDomain(configuredDomain: string | undefined): string {
  return gardenEnv.USE_GARDEN_CLOUD_V2 ? getGrowCloudDomain(configuredDomain) : getGardenCloudDomain(configuredDomain)
}

export function isGardenCommunityEdition(cloudDomain: string): boolean {
  return cloudDomain === DEFAULT_GARDEN_CLOUD_DOMAIN
}
