/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ModuleAndRuntimeActionHandlers } from "../../../types/plugin/plugin"
import { HelmModule, configureHelmModule } from "./config"
import { buildHelmModule } from "./build"
import { getServiceStatus } from "./status"
import { deployHelmService, deleteService } from "./deployment"
import { getTestResult } from "../test-results"
import { runHelmTask, runHelmModule } from "./run"
import { hotReloadHelmChart } from "./hot-reload"
import { getServiceLogs } from "./logs"
import { testHelmModule } from "./test"
import { getPortForwardHandler } from "../port-forward"
import { getTaskResult } from "../task-results"

export const helmHandlers: Partial<ModuleAndRuntimeActionHandlers<HelmModule>> = {
  build: buildHelmModule,
  configure: configureHelmModule,
  // TODO: add execInService handler
  deleteService,
  deployService: deployHelmService,
  getPortForward: getPortForwardHandler,
  getServiceLogs,
  getServiceStatus,
  getTaskResult,
  getTestResult,
  hotReloadService: hotReloadHelmChart,
  // TODO: add publishModule handler
  runModule: runHelmModule,
  runTask: runHelmTask,
  testModule: testHelmModule,
}
