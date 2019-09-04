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
import { joi } from "../../../config/common"

export interface HotReloadServiceParams<M extends Module = Module, S extends Module = Module>
  extends PluginServiceActionParamsBase<M, S> {}

export interface HotReloadServiceResult {}

export const hotReloadService = {
  description: dedent`
    Synchronize changes directly into a running service, instead of doing a full redeploy.
  `,
  paramsSchema: serviceActionParamsSchema,
  resultSchema: joi.object().keys({}),
}
