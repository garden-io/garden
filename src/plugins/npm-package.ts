/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleConfig } from "../types/module"
import { GardenPlugin } from "../types/plugin"
import { ServiceConfig } from "../types/service"
import {
  genericPlugin,
} from "./generic"

let _moduleConfig: ModuleConfig
let _serviceConfig: ServiceConfig

export const gardenPlugin = (): GardenPlugin => ({
  moduleActions: {
    "npm-package": genericPlugin.moduleActions.generic,
  },
})
