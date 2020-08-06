/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenModule } from "./module"
import { TaskConfig } from "../config/task"

export interface Task<M extends GardenModule = GardenModule> {
  name: string
  description?: string
  module: M
  disabled: boolean
  config: M["taskConfigs"][0]
  spec: M["taskConfigs"][0]["spec"]
}

export function taskFromConfig<M extends GardenModule = GardenModule>(module: M, config: TaskConfig): Task<M> {
  return {
    name: config.name,
    module,
    disabled: module.disabled || config.disabled,
    config,
    spec: config.spec,
  }
}
