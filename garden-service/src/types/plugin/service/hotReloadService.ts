/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { RuntimeContext, runtimeContextSchema } from "../../service"

export interface HotReloadServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {
  runtimeContext: RuntimeContext
}

export interface HotReloadServiceResult { }

export const hotReloadService = {
  description: dedent`
    Synchronize changes directly into a running service, instead of doing a full redeploy.
  `,
  paramsSchema: serviceActionParamsSchema
    .keys({ runtimeContext: runtimeContextSchema }),
  resultSchema: Joi.object().keys({}),
}
