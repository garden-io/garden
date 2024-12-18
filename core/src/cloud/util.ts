/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants.js"

export type CloudDistroName = "the Garden dashboard" | "Garden Enterprise" | "Garden Cloud"

/**
 * Returns "Garden Cloud" if domain matches https://<some-subdomain>.app.garden,
 * otherwise "Garden Enterprise".
 *
 * TODO: Return the distribution type from the API and store on the CloudApi class.
 */
export function getCloudDistributionName(domain: string): CloudDistroName {
  if (domain === DEFAULT_GARDEN_CLOUD_DOMAIN) {
    return "the Garden dashboard"
  }

  // TODO: consider using URL object instead.
  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }

  return "Garden Cloud"
}

export type CloudLogSectionName = "garden-dashboard" | "garden-cloud" | "garden-enterprise"

export function getCloudLogSectionName(distroName: CloudDistroName): CloudLogSectionName {
  if (distroName === "the Garden dashboard") {
    return "garden-dashboard"
  } else if (distroName === "Garden Cloud") {
    return "garden-cloud"
  } else if (distroName === "Garden Enterprise") {
    return "garden-enterprise"
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
