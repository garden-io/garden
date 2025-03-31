/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { ActionRouter } from "../../../../src/router/router.js"
import type { TestGarden } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../../../../src/constants.js"

describe("module actions", () => {
  let garden: TestGarden
  let actionRouter: ActionRouter
  let log: Log

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    actionRouter = data.actionRouter
    log = data.log
  })

  describe("configureModule", () => {
    it("should consolidate the declared build dependencies", async () => {
      const moduleConfigA = (await garden.getRawModuleConfigs(["module-a"]))[0]

      const moduleConfig = {
        ...moduleConfigA,
        build: {
          dependencies: [
            { name: "module-b", copy: [{ source: "1", target: "1" }] },
            { name: "module-b", copy: [{ source: "2", target: "2" }] },
            { name: "module-b", copy: [{ source: "2", target: "2" }] },
            { name: "module-c", copy: [{ source: "3", target: "3" }] },
          ],
          timeout: DEFAULT_BUILD_TIMEOUT_SEC,
        },
      }

      const result = await actionRouter.module.configureModule({ log, moduleConfig })
      expect(result.moduleConfig.build.dependencies).to.eql([
        {
          name: "module-b",
          copy: [
            { source: "1", target: "1" },
            { source: "2", target: "2" },
          ],
        },
        {
          name: "module-c",
          copy: [{ source: "3", target: "3" }],
        },
      ])
    })
  })
})
