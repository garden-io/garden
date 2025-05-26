/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginDeployActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import { dedent } from "../../../util/string.js"
import type { DeployAction } from "../../../actions/deploy.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type {
  ActionState,
  ActionStatus,
  ActionStatusMap,
  GetActionOutputType,
  Resolved,
} from "../../../actions/types.js"
import { actionStatusSchema } from "../../../actions/base.js"
import { createSchema } from "../../../config/common.js"
import type { ServiceStatus, DeployState } from "../../../types/service.js"
import { serviceStatusSchema } from "../../../types/service.js"

type GetDeployStatusParams<T extends DeployAction> = PluginDeployActionParamsBase<T>

export type DeployStatus<T extends DeployAction = DeployAction> = ActionStatus<
  T,
  ServiceStatus<any, GetActionOutputType<T>>
>

export interface DeployStatusMap extends ActionStatusMap<DeployAction> {
  [key: string]: DeployStatus
}

const deployStateMap: { [key in DeployState]: ActionState } = {
  ready: "ready",
  deploying: "processing",
  stopped: "not-ready",
  unhealthy: "failed",
  unknown: "unknown",
  outdated: "not-ready",
  missing: "not-ready",
}

export function deployStateToActionState(state: DeployState): ActionState {
  return deployStateMap[state]
}

export const getDeployStatusSchema = createSchema({
  name: "get-deploy-status",
  keys: () => ({
    detail: serviceStatusSchema,
  }),
  extend: actionStatusSchema,
})

export class GetDeployStatus<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetDeployStatusParams<Resolved<T>>,
  DeployStatus<T>
> {
  description = dedent`
    Check and return the current runtime status of a deployment.

    Called ahead of any actions that expect a deployment to be running, as well as the \`garden get status\` command.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getDeployStatusSchema()
}
