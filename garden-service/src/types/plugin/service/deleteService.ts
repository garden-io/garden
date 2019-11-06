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
import { serviceStatusSchema } from "../../service"

export interface DeleteServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {}

export const deleteService = {
  description: dedent`
    Terminate a deployed service. This should wait until the service is no longer running.

    Called by the \`garden delete service\` command.
  `,
  paramsSchema: serviceActionParamsSchema,
  resultSchema: serviceStatusSchema,
}
