/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { ProjectConfig } from "../config/project.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants.js"
import type { Log } from "../logger/log-entry.js"
import type { Garden } from "../garden.js"
import { RestfulEventStream } from "./api-legacy/restful-event-stream.js"
import { GrpcEventStream } from "./api/grpc-event-stream.js"
import { eventLogLevel } from "../logger/logger.js"
import { got } from "../util/http.js"

export type GardenCloudDistroName = "Garden Enterprise" | "Garden Cloud"

export type CloudDistroName = GardenCloudDistroName

export function getCloudDistributionName(domain: string): CloudDistroName {
  if (domain === DEFAULT_GARDEN_CLOUD_DOMAIN) {
    // The new backend is just called "Garden Cloud"
    return "Garden Cloud"
  }

  // TODO: consider using URL object instead.
  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }

  return "Garden Cloud"
}

export type GardenCloudLogSectionName = "garden-cloud" | "garden-enterprise"
export type CloudLogSectionName = GardenCloudLogSectionName

export function getCloudLogSectionName(distroName: CloudDistroName): CloudLogSectionName {
  if (distroName === "Garden Cloud") {
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
 *
 * For customer migrations: if the configured domain ends with `.app.garden` and redirects
 * to the default domain, this function will return the default domain instead.
 */
export async function getCloudDomain(projectConfig: ProjectConfig): Promise<string> {
  const configuredDomain = projectConfig.domain

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    return new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (configuredDomain) {
    const domainUrl = new URL(configuredDomain)
    const domainOrigin = domainUrl.origin

    // Check if this is an .app.garden domain that might have been migrated
    if (domainUrl.hostname.endsWith(".app.garden")) {
      try {
        // Check if the domain redirects to the default domain
        const response = await got.head(domainOrigin, {
          followRedirect: false,
          throwHttpErrors: false,
        })

        // Check for redirect responses (301, 302, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400) {
          const location = response.headers.location
          if (location) {
            const redirectUrl = new URL(location, domainOrigin)
            if (redirectUrl.origin === DEFAULT_GARDEN_CLOUD_DOMAIN) {
              return DEFAULT_GARDEN_CLOUD_DOMAIN
            }
          }
        }
      } catch (error) {
        // If the request fails, fall back to using the configured domain
        // This could happen if the domain is unreachable
      }
    }

    return domainOrigin
  }

  return DEFAULT_GARDEN_CLOUD_DOMAIN
}

export type CloudBackendType = "v1" | "v2"

export async function getBackendType(projectConfig: ProjectConfig): Promise<CloudBackendType> {
  const cloudDomain = await getCloudDomain(projectConfig)
  if (cloudDomain === DEFAULT_GARDEN_CLOUD_DOMAIN) {
    return "v2"
  }
  return projectConfig.id ? "v1" : "v2"
}

export async function useLegacyCloud(projectConfig: ProjectConfig): Promise<boolean> {
  return (await getBackendType(projectConfig)) === "v1"
}

interface CreateCloudEventStreamParams {
  sessionId: string
  log: Log
  garden: Garden
  opts: { streamEvents: boolean; streamLogEntries: boolean }
}

export function createCloudEventStream({
  sessionId,
  log,
  garden,
  opts,
}: CreateCloudEventStreamParams): RestfulEventStream | GrpcEventStream | undefined {
  const streamLogEntries =
    opts.streamLogEntries &&
    !(gardenEnv.GARDEN_DISABLE_CLOUD_LOGS === true || garden.getProjectConfig().disableCloudLogs === true)

  if (garden.isOldBackendAvailable()) {
    const cloudApi = garden.cloudApiLegacy
    const cloudSession = cloudApi.getRegisteredSession(sessionId)
    if (!cloudSession) {
      log.debug(`Cannot find session ${sessionId}. No events will be sent to ${cloudApi.distroName}.`)
      return undefined
    }

    return new RestfulEventStream({
      log,
      cloudSession,
      maxLogLevel: eventLogLevel,
      garden,
      streamEvents: opts.streamEvents,
      streamLogEntries,
    })
  }

  if (garden.isNewBackendAvailable() && opts.streamEvents) {
    return new GrpcEventStream({
      log,
      garden,
      streamLogEntries,
      eventIngestionService: garden.cloudApi.eventIngestionService,
    })
  }

  log.debug(`Neither old nor new backend is available. No events will be sent to the Garden Cloud API.`)
  return undefined
}
