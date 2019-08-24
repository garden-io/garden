/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { createGardenPlugin } from "../../types/plugin/plugin"
import { gardenPlugin as o6sPlugin } from "./openfaas"

// TODO: avoid having to configure separate plugins, by allowing for this scenario in the plugin mechanism
export const gardenPlugin = createGardenPlugin({
  ...o6sPlugin,
  name: "local-openfaas",
  dependencies: ["local-kubernetes"],
})
