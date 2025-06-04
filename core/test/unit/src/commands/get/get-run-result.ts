/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import type { TestGarden } from "../../../../helpers.js"
import { expectError, withDefaultGlobalOpts, cleanProject, makeTestGarden, getDataDir } from "../../../../helpers.js"
import { GetRunResultCommand } from "../../../../../src/commands/get/get-run-result.js"
import { expect } from "chai"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { getArtifactKey } from "../../../../../src/util/artifacts.js"
import fsExtra from "fs-extra"
const { writeFile } = fsExtra
import type { GetRunResult } from "../../../../../src/plugin/handlers/Run/get-result.js"

const now = new Date()

describe("GetRunResultCommand", () => {
  let garden: TestGarden
  let log: Log
  const projectRootB = getDataDir("test-project-b")
  const command = new GetRunResultCommand()

  beforeEach(async () => {
    garden = await makeTestGarden(projectRootB, { noCache: true })
    log = garden.log
  })

  afterEach(async () => {
    await cleanProject(garden.gardenDirPath)
  })

  it("throws error if action is not found", async () => {
    const name = "banana"

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          args: { name },
          opts: withDefaultGlobalOpts({}),
        }),
      { type: "graph", contains: `Could not find Run action ${name}` }
    )
  })

  it("should return the Run result", async () => {
    const name = "task-a"

    const status: GetRunResult = {
      detail: { success: true, startedAt: now, completedAt: now, log: "bla" },
      outputs: {
        log: "bla",
      },
      state: "ready",
    }

    await garden.setTestActionStatus({
      log,
      kind: "Run",
      name,
      status,
    })

    const res = await command.action({
      garden,
      log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    expect(res.result).to.be.eql({
      ...status,
      artifacts: [],
    })
  })

  it("should include paths to artifacts if artifacts exist", async () => {
    const name = "task-a"

    const status: GetRunResult = {
      detail: { success: true, startedAt: now, completedAt: now, log: "bla" },
      outputs: {
        log: "bla",
      },
      state: "ready",
    }

    await garden.setTestActionStatus({
      log,
      kind: "Run",
      name,
      status,
    })

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const runAction = graph.getRun(name)
    const artifactKey = getArtifactKey("run", name, runAction.versionString())
    const metadataPath = join(garden.artifactsPath, `.metadata.${artifactKey}.json`)
    const metadata = {
      key: artifactKey,
      files: ["/foo/bar.txt", "/bas/bar.txt"],
    }

    await writeFile(metadataPath, JSON.stringify(metadata))

    const res = await command.action({
      garden,
      log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.eql({
      ...status,
      artifacts: ["/foo/bar.txt", "/bas/bar.txt"],
    })
  })

  it("should return empty result if Run result does not exist", async () => {
    const name = "task-c"

    const res = await command.action({
      garden,
      log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.eql({
      artifacts: [],
      state: "not-ready",
      detail: null,
      outputs: {},
    })
  })
})
