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
import { RestfulEventStream } from "./legacy/restful-event-stream.js"
import { GrpcEventStream } from "./grow/grpc-event-stream.js"
import { eventLogLevel } from "../logger/logger.js"

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
 */
export function getCloudDomain(projectConfig: ProjectConfig): string {
  const configuredDomain = projectConfig?.domain

  if (gardenEnv.GARDEN_CLOUD_DOMAIN) {
    return new URL(gardenEnv.GARDEN_CLOUD_DOMAIN).origin
  } else if (configuredDomain) {
    return new URL(configuredDomain).origin
  }

  return DEFAULT_GARDEN_CLOUD_DOMAIN
}

export function getBackendType(projectConfig: ProjectConfig): "v1" | "v2" {
  return projectConfig.id ? "v1" : "v2"
}

export function useLegacyCloud(projectConfig: ProjectConfig) {
  return getBackendType(projectConfig) === "v1"
}

interface CreateCloudEventStreamParams {
  sessionId: string
  log: Log
  garden: Garden
  opts: { shouldStreamEvents: boolean; shouldStreamLogs: boolean }
}

export function createCloudEventStream({
  sessionId,
  log,
  garden,
  opts,
}: CreateCloudEventStreamParams): RestfulEventStream | GrpcEventStream | undefined {
  if (garden.isOldBackendAvailable()) {
    const cloudApi = garden.cloudApi
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
      streamEvents: opts.shouldStreamEvents,
      streamLogEntries: opts.shouldStreamLogs,
    })
  }

  if (garden.isNewBackendAvailable() && opts.shouldStreamEvents) {
    return new GrpcEventStream({
      log,
      garden,
      shouldStreamLogEntries: opts.shouldStreamLogs,
      eventIngestionService: garden.cloudApiV2.eventIngestionService,
    })
  }

  log.debug(`Neither old nor new backend is available. No events will be sent to the Garden Cloud API.`)
  return undefined
}
