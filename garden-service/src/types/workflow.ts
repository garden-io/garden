/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Module } from "./module"
import { WorkflowConfig } from "../config/workflow"

export interface Workflow<M extends Module = Module> {
  name: string
  module: M
  config: M["workflowConfigs"][0]
  spec: M["workflowConfigs"][0]["spec"]
}

export function workflowFromConfig<M extends Module = Module>(module: M, config: WorkflowConfig): Workflow<M> {
  return {
    name: config.name,
    module,
    config,
    spec: config.spec,
  }
}
