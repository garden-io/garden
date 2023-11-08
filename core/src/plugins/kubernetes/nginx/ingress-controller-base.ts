/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import type { DeployState } from "../../../types/service.js"

export abstract class GardenIngressController {
  abstract install(ctx: KubernetesPluginContext, log: Log): Promise<void>

  abstract uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void>

  async ready(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
    return (await this.getStatus(ctx, log)) === "ready"
  }

  abstract getStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState>
}
