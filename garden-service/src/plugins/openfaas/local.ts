/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenPlugin } from "../../types/plugin/plugin"
import { gardenPlugin as o6sPlugin } from "./openfaas"

export const name = "local-openfaas"

// TODO: avoid having to configure separate plugins, by allowing for this scenario in the plugin mechanism
export function gardenPlugin(): GardenPlugin {
  const plugin = o6sPlugin()
  plugin.dependencies = ["local-kubernetes"]
  return plugin
}
