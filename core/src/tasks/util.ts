/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Action } from "../actions/types"
import { DeployStatus } from "../plugin/handlers/Deploy/get-status"
import { DeployStatusForEventPayload } from "../types/service"

export function makeActionStatusEventPayloadBase(action: Action) {
  return {
    actionName: action.name,
    actionVersion: action.versionString(),
    // NOTE: The type/kind needs to be lower case in the event payload
    actionType: action.kind.toLowerCase(),
    actionKind: action.kind.toLowerCase(),
    actionUid: action.getUid(),
    moduleName: action.moduleName(),
    startedAt: new Date().toISOString(),
  }
}

export function makeDeployStatusEventPayload(status: DeployStatus): DeployStatusForEventPayload {
  const detail = status.detail

  if (!detail) {
    return { state: "unknown" }
  }

  return {
    createdAt: detail.createdAt,
    mode: detail.mode,
    namespaceStatuses: detail.namespaceStatuses,
    externalId: detail.externalId,
    externalVersion: detail.externalVersion,
    forwardablePorts: detail.forwardablePorts,
    ingresses: detail.ingresses,
    lastMessage: detail.lastMessage,
    lastError: detail.lastError,
    outputs: detail.outputs,
    runningReplicas: detail.runningReplicas,
    updatedAt: detail.updatedAt,
    state: detail.state,
  }
}

