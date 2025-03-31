/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GlobalConfigStore } from "../../../src/config-store/global.js"
import { registerProcess } from "../../../src/process.js"
import type { TempDirectory } from "../../helpers.js"
import { freezeTime, makeTempDir } from "../../helpers.js"

describe("registerProcess", () => {
  let store: GlobalConfigStore
  let tmpDir: TempDirectory
  let now: Date

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    store = new GlobalConfigStore(tmpDir.path)
    now = freezeTime()
  })

  afterEach(async () => {
    await tmpDir?.cleanup()
  })

  it("registers the current process in the global config store", async () => {
    await registerProcess(store, "foo", ["foo", "bar"])

    const record = await store.get("activeProcesses", String(process.pid))

    expect(record).to.eql({
      pid: process.pid,
      startedAt: now,
      arguments: ["foo", "bar"],
      sessionId: null,
      projectRoot: null,
      projectName: null,
      environmentName: null,
      namespace: null,
      persistent: false,
      serverHost: null,
      serverAuthKey: null,
      command: "foo",
    })
  })

  it("cleans up any dead processes", async () => {
    const oldPid = 999999999
    await store.set("activeProcesses", String(oldPid), {
      pid: oldPid,
      startedAt: now,
      arguments: ["foo", "bar"],
      sessionId: null,
      projectRoot: null,
      projectName: null,
      environmentName: null,
      namespace: null,
      persistent: false,
      serverHost: null,
      serverAuthKey: null,
      command: "foo",
    })
    await registerProcess(store, "foo", ["foo", "bar"])
    const record = await store.get("activeProcesses", String(oldPid))
    expect(record).to.be.undefined
  })
})
