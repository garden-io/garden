/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { WorkflowConfig } from "../config/workflow.js"
import { makeRunConfig } from "../config/workflow.js"
import type { Log } from "../logger/log-entry.js"
import { CloudApiError } from "../exceptions.js"
import { gardenEnv } from "../constants.js"
import type { GardenWithOldBackend } from "../garden.js"
import type { ApiFetchResponse } from "./http-client.js"
import type { CreateWorkflowRunResponse } from "@garden-io/platform-api-types"
import { dedent } from "../util/string.js"
import { GotHttpError } from "../util/http.js"

export interface RegisterWorkflowRunParams {
  workflowConfig: WorkflowConfig
  garden: GardenWithOldBackend
  environment: string
  namespace: string
  log: Log
}

/**
 * Registers the workflow run with the platform, and returns the UID generated for the run.
 */
export async function registerWorkflowRun({
  garden,
  workflowConfig,
  environment,
  namespace,
  log,
}: RegisterWorkflowRunParams): Promise<string> {
  log.debug(`Registering workflow run for ${workflowConfig.name}...`)

  const workflowRunConfig = makeRunConfig(workflowConfig, environment, namespace)
  const requestData = {
    projectUid: garden.projectId,
    workflowRunConfig,
  }
  if (gardenEnv.GARDEN_GE_SCHEDULED) {
    requestData["workflowRunUid"] = gardenEnv.GARDEN_WORKFLOW_RUN_UID
  }
  const cloudApi = garden.cloudApi

  // TODO: Use API types package here.
  let res: ApiFetchResponse<CreateWorkflowRunResponse>
  try {
    res = await cloudApi.post("workflow-runs", {
      body: requestData,
      retry: true,
      retryDescription: "Registering workflow run",
    })
  } catch (err) {
    if (!(err instanceof GotHttpError)) {
      throw err
    }
    if (err.response.statusCode === 422) {
      throw new CloudApiError({
        message: dedent`
          Workflow run registration failed due to mismatch between CLI and API versions. Please make sure your Garden
          CLI version is compatible with your version of Garden Cloud.

          Request body: ${JSON.stringify(requestData)}
          Response body: ${err.response.rawBody}
        `,
        responseStatusCode: err.response.statusCode,
      })
    } else {
      log.error(`An error occurred while registering workflow run: ${err.message}`)
      throw err
    }
  }

  if (res?.workflowRunUid && res?.status === "success") {
    return res.workflowRunUid
  } else {
    throw new CloudApiError({
      message: `Error while registering workflow run: Request failed with status ${res?.status}.`,
    })
  }
}
