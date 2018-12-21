/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Module } from "./module"
import { TaskConfig } from "../config/task"

export interface Task<M extends Module = Module> {
  name: string
  description?: string
  module: M
  config: M["taskConfigs"][0]
  spec: M["taskConfigs"][0]["spec"]
}

export function taskFromConfig<M extends Module = Module>(module: M, config: TaskConfig): Task<M> {
  return {
    name: config.name,
    module,
    config,
    spec: config.spec,
  }
}
