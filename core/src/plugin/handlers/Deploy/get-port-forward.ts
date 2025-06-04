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
import type { ForwardablePort } from "../../../types/service.js"
import { forwardablePortKeys } from "../../../types/service.js"
import { joi } from "../../../config/common.js"
import type { DeployAction } from "../../../actions/deploy.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import type { Executed } from "../../../actions/types.js"

export type GetPortForwardParams<T extends DeployAction> = PluginDeployActionParamsBase<T> & ForwardablePort

export interface GetPortForwardResult {
  hostname: string
  port: number
}

export class GetDeployPortForward<T extends DeployAction = DeployAction> extends ActionTypeHandlerSpec<
  "Deploy",
  GetPortForwardParams<Executed<T>>,
  GetPortForwardResult
> {
  description = dedent`
    Create a port forward tunnel to the specified service and port. When \`getServiceStatus\` returns one or more
    \`forwardablePort\` specs, the Garden service creates an open port. When connections are made to that port,
    this handler is called to create a tunnel, and the connection (and any subsequent connections) is forwarded to
    the tunnel.

    The tunnel should be persistent. If the tunnel stops listening to connections, this handler will be called again.

    If there is a corresponding \`stopPortForward\` handler, it is called when cleaning up.
  `

  paramsSchema = () => actionParamsSchema().keys(forwardablePortKeys())

  resultSchema = () =>
    joi.object().keys({
      hostname: joi.string().hostname().description("The hostname of the port tunnel.").example("localhost"),
      port: joi.number().integer().description("The port of the tunnel.").example(12345),
    })
}
