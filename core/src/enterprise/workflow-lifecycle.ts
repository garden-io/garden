/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { got, GotResponse } from "../util/http"
import { makeAuthHeader } from "./auth"
import { WorkflowConfig, makeRunConfig } from "../config/workflow"
import { LogEntry } from "../logger/log-entry"
import { EnterpriseApiError } from "../exceptions"
import { GardenEnterpriseContext } from "./init"
import { gardenEnv } from "../constants"

export interface RegisterWorkflowRunParams {
  workflowConfig: WorkflowConfig
  enterpriseContext: GardenEnterpriseContext
  environment: string
  namespace: string
  log: LogEntry
}

/**
 * Registers the workflow run with the platform, and returns the UID generated for the run.
 */
export async function registerWorkflowRun({
  enterpriseContext,
  workflowConfig,
  environment,
  namespace,
  log,
}: RegisterWorkflowRunParams): Promise<string> {
  const { clientAuthToken, projectId, enterpriseDomain } = enterpriseContext
  log.debug(`Registering workflow run for ${workflowConfig.name}...`)
  const headers = makeAuthHeader(clientAuthToken)
  const workflowRunConfig = makeRunConfig(workflowConfig, environment, namespace)
  const requestData = {
    projectUid: projectId,
    workflowRunConfig,
  }
  if (gardenEnv.GARDEN_GE_SCHEDULED) {
    requestData["workflowRunUid"] = gardenEnv.GARDEN_WORKFLOW_RUN_UID
  }
  let res
  try {
    res = await got.post(`${enterpriseDomain}/workflow-runs`, { json: requestData, headers }).json<GotResponse<any>>()
  } catch (err) {
    log.error(`An error occurred while registering workflow run: ${err.message}`)
    throw err
  }

  if (res && res["workflowRunUid"] && res["status"] === "success") {
    return res["workflowRunUid"]
  } else {
    throw new EnterpriseApiError(`Error while registering workflow run: Request failed with status ${res["status"]}`, {
      status: res["status"],
      workflowRunUid: res["workflowRunUid"],
    })
  }
}
