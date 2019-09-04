/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { ForwardablePort, forwardablePortKeys } from "../../service"
import { joi } from "../../../config/common"

export type GetPortForwardParams<M extends Module = Module, S extends Module = Module> = PluginServiceActionParamsBase<
  M,
  S
> &
  ForwardablePort

export interface GetPortForwardResult {
  hostname: string
  port: number
}

export const getPortForward = {
  description: dedent`
    Create a port forward tunnel to the specified service and port. When \`getServiceStatus\` returns one or more
    \`forwardablePort\` specs, the Garden service creates an open port. When connections are made to that port,
    this handler is called to create a tunnel, and the connection (and any subsequent connections) is forwarded to
    the tunnel.

    The tunnel should be persistent. If the tunnel stops listening to connections, this handler will be called again.

    If there is a corresponding \`stopPortForward\` handler, it is called when cleaning up.
  `,
  paramsSchema: serviceActionParamsSchema.keys(forwardablePortKeys),
  resultSchema: joi.object().keys({
    hostname: joi
      .string()
      .hostname()
      .description("The hostname of the port tunnel.")
      .example("localhost"),
    port: joi
      .number()
      .integer()
      .description("The port of the tunnel.")
      .example(12345),
  }),
}
