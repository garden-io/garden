/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { WorkflowConfig, makeRunConfig } from "../config/workflow"
import { LogEntry } from "../logger/log-entry"
import { EnterpriseApiError } from "../exceptions"
import { gardenEnv } from "../constants"
import { Garden } from "../garden"

export interface RegisterWorkflowRunParams {
  workflowConfig: WorkflowConfig
  garden: Garden
  environment: string
  namespace: string
  log: LogEntry
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
  const { enterpriseApi, projectId } = garden
  const workflowRunConfig = makeRunConfig(workflowConfig, environment, namespace)
  const requestData = {
    projectUid: projectId,
    workflowRunConfig,
  }
  if (gardenEnv.GARDEN_GE_SCHEDULED) {
    requestData["workflowRunUid"] = gardenEnv.GARDEN_WORKFLOW_RUN_UID
  }
  if (enterpriseApi) {
    let res
    try {
      res = await enterpriseApi.post("workflow-runs", { body: requestData })
    } catch (err) {
      log.error(`An error occurred while registering workflow run: ${err.message}`)
      throw err
    }
    const body = res.body

    if (body && body["workflowRunUid"] && body["status"] === "success") {
      return body["workflowRunUid"]
    } else {
      throw new EnterpriseApiError(
        `Error while registering workflow run: Request failed with status ${body["status"]}`,
        {
          status: body["status"],
          workflowRunUid: body["workflowRunUid"],
        }
      )
    }
  }
  throw new EnterpriseApiError("Error while registering workflow run: Couldn't initialize API.", {})
}
