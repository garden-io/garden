/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger/log-entry"
import { CommandInfo } from "../plugin-context"
import { deline } from "../util/string"
import { EnterpriseApi, isGotError } from "./api"

export interface RegisterSessionParams {
  enterpriseApi: EnterpriseApi
  sessionId: string
  commandInfo: CommandInfo
  localServerPort?: number
  projectId: string
  environment: string
  namespace: string
  log: LogEntry
}

export interface RegisterSessionResponse {
  environmentId: number
  namespaceId: number
}

// TODO: Read this from the `api-types` package once the session registration logic has been released in Cloud.
/**
 * Registers a session for a persistent command with Garden Cloud/Enterprise. This is to help the Cloud/Enterprise
 * UI communicate with the locally running Core process.
 */
export async function registerSession({
  enterpriseApi,
  sessionId,
  commandInfo,
  localServerPort,
  projectId,
  environment,
  namespace,
  log,
}: RegisterSessionParams): Promise<RegisterSessionResponse | null> {
  try {
    const body = {
      sessionId,
      commandInfo,
      localServerPort,
      projectUid: projectId,
      environment,
      namespace,
    }
    const res: RegisterSessionResponse = await enterpriseApi.post("sessions", {
      body,
      retry: true,
      retryDescription: "Registering session",
    })
    return res
  } catch (err) {
    if (isGotError(err, 422)) {
      const errMsg = deline`
        Session registration failed due to mismatch between CLI and API versions. Please make sure your Garden CLI
        version is compatible with your version of Garden Enterprise.
      `
      log.error(errMsg)
    } else {
      // TODO: Reintroduce error-level warning when we're checking if the Cloud/Enterprise version is compatible with
      // the Core version.
      log.verbose(`An error occurred while registering the session: ${err.message}`)
    }
    // We don't want the command to fail when an error occurs during session registration.
    return null
  }
}
