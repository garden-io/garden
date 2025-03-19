/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { ProjectConfig } from "../config/project.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants.js"
import type { GrowCloudDistroName, GrowCloudLogSectionName } from "./grow/util.js"
import { getGrowCloudDomain } from "./grow/util.js"
import { getGrowCloudDistributionName, getGrowCloudLogSectionName } from "./grow/util.js"

export type GardenCloudDistroName = "the Garden dashboard" | "Garden Enterprise" | "Garden Cloud"

export type CloudDistroName = GardenCloudDistroName | GrowCloudDistroName

/**
 * Returns "Garden Cloud" if domain matches https://<some-subdomain>.app.garden,
 * otherwise "Garden Enterprise".
 *
 * TODO: Return the distribution type from the API and store on the CloudApi class.
 */
export function getGardenCloudDistributionName(domain: string): CloudDistroName {
  // TODO: consider using URL object instead.
  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }

  return "Garden Cloud"
}

/**
 * Returns the name of the effective Cloud backend (either Grow or Garden).
 */
export function getCloudDistributionName({
  domain,
  projectId,
}: {
  domain: string | undefined
  projectId: string | undefined
}): CloudDistroName {
  return getBackendType(projectId) === "old" && domain
    ? getGardenCloudDistributionName(domain)
    : getGrowCloudDistributionName()
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

export function getCloudDomain(projectConfig: ProjectConfig | undefined): string {
  const configuredDomain = projectConfig?.domain
  // The `id` field is only used by paying customers of the old backend.
  // If no `id` is present, we assume the user is using the new backend.
  return getBackendType(projectConfig?.id) === "old"
    ? getGardenCloudDomain(configuredDomain)
    : getGrowCloudDomain(configuredDomain)
}

export function getBackendType(projectId: string | undefined): "old" | "new" {
  return projectId ? "old" : "new"
}

export function isGardenCommunityEdition(cloudDomain: string): boolean {
  return cloudDomain === DEFAULT_GARDEN_CLOUD_DOMAIN
}
