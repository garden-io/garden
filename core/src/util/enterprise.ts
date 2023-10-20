/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../constants"
import { PluginContext } from "../plugin-context"

export function isGardenEnterprise(ctx: PluginContext): boolean {
  return !!(ctx.projectId && ctx.cloudApi && ctx.cloudApi?.domain !== DEFAULT_GARDEN_CLOUD_DOMAIN)
}
