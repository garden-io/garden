/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenPlugin } from "../../../types/plugin/plugin"
import { gardenPlugin as k8sPlugin } from "../kubernetes"
import { configureProvider, configSchema } from "./config"
import { getEnvironmentStatus } from "../init"
import { GetEnvironmentStatusParams } from "../../../types/plugin/provider/getEnvironmentStatus"

export const name = "local-kubernetes"

export function gardenPlugin(): GardenPlugin {
  const plugin = k8sPlugin()

  plugin.configSchema = configSchema

  plugin.actions!.getEnvironmentStatus = getLocalEnvironmentStatus
  plugin.actions!.configureProvider = configureProvider

  return plugin
}

async function getLocalEnvironmentStatus(params: GetEnvironmentStatusParams) {
  const status = await getEnvironmentStatus(params)

  // The local-kubernetes plugin shouldn't require manual init
  status.needManualInit = false

  return status
}
