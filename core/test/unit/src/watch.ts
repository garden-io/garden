/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, join } from "path"
import { expect } from "chai"
import {
  TestGarden,
  makeTestGarden,
  getDataDir,
} from "../../helpers"
import { CacheContext, pathToCacheContext } from "../../../src/cache"

function emitEvent(garden: TestGarden, name: string, payload: any) {
  garden["watcher"]["watcher"]!.emit(name, payload)
}

describe("Watcher", () => {
  let garden: TestGarden
  let modulePath: string
  let doubleModulePath: string
  let includeModulePath: string
  let moduleContext: CacheContext

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-project-watch"), { noTempDir: true, noCache: true })
    modulePath = resolve(garden.projectRoot, "module-a")
    doubleModulePath = resolve(garden.projectRoot, "double-module")
    includeModulePath = resolve(garden.projectRoot, "with-include")
    moduleContext = pathToCacheContext(modulePath)
    await garden.startWatcher()
  })

  beforeEach(async () => {
    garden.events.clearLog()
    garden["watcher"]["addBuffer"] = {}
  })

  after(async () => {
    await garden.close()
  })

  function getEventLog() {
    // Filter out task events, which come from module resolution
    return garden.events.eventLog.filter((e) => !e.name.startsWith("task"))
  }

  function getConfigFilePath(path: string) {
    return join(path, "garden.yml")
  }

  it("should emit a configChanged changed event when a config is changed", async () => {
    const path = getConfigFilePath(modulePath)
    emitEvent(garden, "change", path)
    expect(getEventLog()).to.eql([{ name: "configChanged", payload: { path } }])
  })
})
