/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../constants.js"

type CloudDistroName = "Cloud Dashboard" | "Garden Enterprise" | "Garden Cloud"

/**
 * Returns "Garden Cloud" if domain matches https://<some-subdomain>.app.garden,
 * otherwise "Garden Enterprise".
 *
 * TODO: Return the distribution type from the API and store on the CloudApi class.
 */
export function getCloudDistributionName(domain: string): CloudDistroName {
  if (domain === DEFAULT_GARDEN_CLOUD_DOMAIN) {
    return "Cloud Dashboard"
  }

  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }

  return "Garden Cloud"
}

export function getCloudLogSectionName(distroName: CloudDistroName): string {
  if (distroName === "Cloud Dashboard") {
    return "cloud-dashboard"
  } else if (distroName === "Garden Cloud") {
    return "garden-cloud"
  } else if (distroName === "Garden Enterprise") {
    return "garden-enterprise"
  } else {
    return distroName satisfies never
  }
}
