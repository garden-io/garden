/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { emptyGlobalConfig, GlobalConfigStore, legacyGlobalConfigFilename } from "../../../src/config-store/global.js"
import type { TempDirectory } from "../../helpers.js"
import { makeTempDir } from "../../helpers.js"
import { dedent } from "../../../src/util/string.js"
import { resolve } from "path"
import fsExtra from "fs-extra"
const { writeFile } = fsExtra
import { legacyLocalConfigFilename, LocalConfigStore } from "../../../src/config-store/local.js"

describe("ConfigStore", () => {
  let store: GlobalConfigStore
  let tmpDir: TempDirectory

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    store = new GlobalConfigStore(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("set", () => {
    it("sets a whole config section if no key is set", async () => {
      const input = { lastRun: new Date() }
      await store.set("versionCheck", input)
      const output = await store.get("versionCheck")
      expect(input).to.eql(output)
    })

    it("sets a specific key in a section if specified", async () => {
      const input = { lastRun: new Date() }
      await store.set("versionCheck", "lastRun", input.lastRun)
      const output = await store.get("versionCheck")
      expect(input).to.eql(output)
    })
  })

  describe("get", () => {
    it("implicitly initializes the config if needed", async () => {
      const empty = await store.get()
      expect(empty).to.eql(emptyGlobalConfig)
    })

    it("returns full config if no section or key specified", async () => {
      const versionCheck = { lastRun: new Date() }
      await store.set("versionCheck", versionCheck)
      const output = await store.get()
      expect(output).to.eql({
        ...emptyGlobalConfig,
        versionCheck,
      })
    })

    it("returns config section if no key is specified", async () => {
      const versionCheck = { lastRun: new Date() }
      await store.set("versionCheck", versionCheck)
      const output = await store.get("versionCheck")
      expect(output).to.eql(versionCheck)
    })

    it("returns specific key if specified", async () => {
      const versionCheck = { lastRun: new Date() }
      await store.set("versionCheck", versionCheck)
      const output = await store.get("versionCheck", "lastRun")
      expect(output).to.eql(versionCheck.lastRun)
    })
  })

  describe("clear", () => {
    it("clears the configuration", async () => {
      const empty = await store.get()
      await store.set("analytics", "firstRunAt", new Date())
      await store.clear()
      expect(await store.get()).to.eql(empty)
    })
  })

  describe("LocalConfigStore", () => {
    const legacyLocalConfig = dedent`
      analytics:
        projectId: foo
      linkedModuleSources:
        - name: name-a
          path: path-a
      linkedProjectSources:
        - name: name-b
          path: path-b
    `

    it("correctly migrates legacy config if new config is missing", async () => {
      const localStore = new LocalConfigStore(tmpDir.path)

      const legacyPath = resolve(tmpDir.path, legacyLocalConfigFilename)
      await writeFile(legacyPath, legacyLocalConfig)

      const config = await localStore.get()

      expect(config.analytics).to.eql({
        projectId: "foo",
      })
      expect(config.linkedModuleSources).to.eql({
        "name-a": { name: "name-a", path: "path-a" },
      })
      expect(config.linkedProjectSources).to.eql({
        "name-b": { name: "name-b", path: "path-b" },
      })
    })

    it("doesn't migrate legacy config if new config file already exists", async () => {
      const localStore = new LocalConfigStore(tmpDir.path)

      await localStore.set("analytics", {})

      const legacyPath = resolve(tmpDir.path, legacyLocalConfigFilename)
      await writeFile(legacyPath, legacyLocalConfig)

      const config = await localStore.get()

      expect(config.analytics).to.eql({})
      expect(config.linkedModuleSources).to.eql({})
      expect(config.linkedProjectSources).to.eql({})
      expect(config.warnings).to.eql({})
    })
  })

  describe("GlobalConfigStore", () => {
    const legacyGlobalConfig = dedent`
      analytics:
        firstRunAt: 'Sun, 29 Jan 2023 00:59:37 GMT'
        lastRunAt: 'Sun, 29 Jan 2023 00:59:57 GMT'
        anonymousUserId: fasgdjhfgaskfjhsdgfkjas
        cloudVersion: 0
        # optedIn: # empty value
        cloudProfileEnabled: false
      versionCheck:
        lastRun: '2023-01-29T01:00:41.999Z'
      requirementsCheck:
        lastRunDateUNIX: 1674954074151
        lastRunGardenVersion: "0.12.48"
        passed: true
    `

    it("correctly migrates legacy config if new config is missing", async () => {
      const legacyPath = resolve(tmpDir.path, legacyGlobalConfigFilename)
      await writeFile(legacyPath, legacyGlobalConfig)

      const config = await store.get()

      expect(config).to.eql({
        activeProcesses: {},
        analytics: {
          anonymousUserId: "fasgdjhfgaskfjhsdgfkjas",
          cloudProfileEnabled: false,
          firstRunAt: new Date("Sun, 29 Jan 2023 00:59:37 GMT"),
          optedOut: false,
        },
        clientAuthTokens: {},
        requirementsCheck: {
          lastRunDateUNIX: 1674954074151,
          lastRunGardenVersion: "0.12.48",
          passed: true,
        },
        versionCheck: {},
      })
    })

    it("doesn't migrate legacy config if new config file already exists", async () => {
      await store.set("analytics", {})

      const legacyPath = resolve(tmpDir.path, legacyGlobalConfigFilename)
      await writeFile(legacyPath, legacyGlobalConfig)

      const config = await store.get()
      expect(config).to.eql(emptyGlobalConfig)
    })
  })
})
