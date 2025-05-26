/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pEvent } from "p-event"
import { resolve, join } from "path"
import { expect } from "chai"
import type { TestGarden } from "../../helpers.js"
import { makeTestGarden, getDataDir } from "../../helpers.js"
import { Watcher } from "../../../src/watch.js"
import { sleep } from "../../../src/util/util.js"
import touch from "touch"

describe("Watcher", () => {
  let garden: TestGarden
  let modulePath: string
  let watcher: Watcher

  // function emitEvent(name: string, payload: any) {
  //   watcher["fsWatcher"].emit(name, payload)
  // }

  before(async () => {
    garden = await makeTestGarden(getDataDir("test-project-watch"), { noTempDir: true, noCache: true })

    modulePath = resolve(garden.projectRoot, "module-a")
    await garden.scanAndAddConfigs()

    garden.watchPaths()
    watcher = Watcher.getInstance({ log: garden.log })
    while (true) {
      if (watcher.ready) {
        break
      }
      await sleep(100)
    }
  })

  beforeEach(() => {
    garden.events.clearLog()
  })

  after(() => {
    garden.close()
  })

  function getConfigFilePath(path: string) {
    return join(path, "garden.yml")
  }

  it("should emit a configChanged changed event when a config is changed", async () => {
    const path = getConfigFilePath(modulePath)
    await Promise.all([touch(path), pEvent(garden.events, "configChanged", (e) => e.path === path)])
  })

  describe("subscribe", () => {
    it("adds the given paths to the underlying watcher", () => {
      const watched = watcher.getWatchedPaths()
      for (const path of garden["configPaths"].values()) {
        expect(watched.has(path)).to.be.true
      }
    })
  })

  describe("unsubscribe", () => {
    it("removes paths that are no longer explicitly subscribed by anyone", () => {
      const path = getConfigFilePath(modulePath)
      expect(watcher.getWatchedPaths().has(path)).to.be.true
      watcher.unsubscribe(garden.events, [{ type: "config", path }])
      expect(watcher.getWatchedPaths().has(path)).to.be.false
    })
  })
})
