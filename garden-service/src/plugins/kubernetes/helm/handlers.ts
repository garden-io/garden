/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleAndRuntimeActions } from "../../../types/plugin/plugin"
import { HelmModule, validateHelmModule as configureHelmModule } from "./config"
import { buildHelmModule } from "./build"
import { getServiceStatus } from "./status"
import { deployService, deleteService } from "./deployment"
import { getTestResult } from "../test"
import { runHelmTask, runHelmModule } from "./run"
import { hotReloadHelmChart } from "./hot-reload"
import { getServiceLogs } from "./logs"
import { testHelmModule } from "./test"

export const helmHandlers: Partial<ModuleAndRuntimeActions<HelmModule>> = {
  build: buildHelmModule,
  configure: configureHelmModule,
  // TODO: add execInService handler
  deleteService,
  deployService,
  getServiceLogs,
  getServiceStatus,
  getTestResult,
  hotReloadService: hotReloadHelmChart,
  // TODO: add publishModule handler
  runModule: runHelmModule,
  runTask: runHelmTask,
  testModule: testHelmModule,
}
