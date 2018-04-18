/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GardenPlugin } from "../../types/plugin"

import {
  configureEnvironment,
  deleteConfig,
  destroyEnvironment,
  execInService,
  getConfig,
  getEnvironmentStatus,
  getServiceLogs,
  getServiceOutputs,
  getServiceStatus,
  getTestResult,
  setConfig,
  testModule,
} from "./actions"
import { deployService } from "./deployment"

export const name = "kubernetes"

export function gardenPlugin(): GardenPlugin {
  return {
    actions: {
      getEnvironmentStatus,
      configureEnvironment,
      destroyEnvironment,
      getConfig,
      setConfig,
      deleteConfig,
    },
    moduleActions: {
      container: {
        getServiceStatus,
        deployService,
        getServiceOutputs,
        execInService,
        testModule,
        getTestResult,
        getServiceLogs,
      },
    },
  }
}
