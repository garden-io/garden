/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginServiceActionParamsBase, serviceActionParamsSchema } from "../base"
import { dedent } from "../../../util/string"
import { GardenModule } from "../../module"
import { joi } from "../../../config/common"

export interface HotReloadServiceParams<M extends GardenModule = GardenModule, S extends GardenModule = GardenModule>
  extends PluginServiceActionParamsBase<M, S> {}

export interface HotReloadServiceResult {}

export const hotReloadService = () => ({
  description: dedent`
    Synchronize changes directly into a running service, instead of doing a full redeploy.
  `,
  paramsSchema: serviceActionParamsSchema(),
  resultSchema: joi.object().keys({}),
})
