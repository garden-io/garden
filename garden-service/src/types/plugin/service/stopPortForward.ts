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

export type StopPortForwardParams<M extends Module = Module, S extends Module = Module> = PluginServiceActionParamsBase<
  M,
  S
> &
  ForwardablePort

export const stopPortForward = {
  description: dedent`
    Close a port forward created by \`getPortForward\`.
  `,
  paramsSchema: serviceActionParamsSchema.keys(forwardablePortKeys),
  resultSchema: joi.object().keys({}),
}
