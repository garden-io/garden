/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import {
  dataDir,
  expectError,
  withDefaultGlobalOpts,
  cleanProject,
  TestGarden,
  makeTestGarden,
  customizedTestPlugin,
} from "../../../../helpers"
import { GetRunResultCommand } from "../../../../../src/commands/get/get-run-result"
import { expect } from "chai"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { getArtifactKey } from "../../../../../src/util/artifacts"
import { writeFile } from "fs-extra"
import { execRunActionSchema } from "../../../../../src/plugins/exec/config"

const now = new Date()

const runResults = {
  "task-a": {
    moduleName: "module-a",
    taskName: "task-a",
    command: ["foo"],
    completedAt: now,
    log: "bla bla",
    outputs: {
      log: "bla bla",
    },
    success: true,
    startedAt: now,
    version: "1234",
  },
  "task-c": null,
}

// TODO-G2: remove commented code and ensure proper actions config
// const testPlugin = createGardenPlugin({
//   name: "test-plugin",
//   createModuleTypes: [
//     {
//       name: "test",
//       docs: "test",
//       schema: testModuleSpecSchema(),
//       handlers: {
//         configure: configureTestModule,
//         getTaskResult: async (params: GetTaskResultParams) => runResults[params.task.name],
//       },
//     },
//   ],
// })

const testPlugin = customizedTestPlugin({
  createActionTypes: {
    Run: [
      {
        name: "test",
        docs: "Test Run action",
        schema: execRunActionSchema(),
        handlers: {
          run: (params) => runResults[params.action.name],
        },
      },
    ],
  },
})

describe("GetRunResultCommand", () => {
  let garden: TestGarden
  let log: LogEntry
  const projectRootB = join(dataDir, "test-project-b")
  const command = new GetRunResultCommand()

  beforeEach(async () => {
    garden = await makeTestGarden(projectRootB, { plugins: [testPlugin], noCache: true })
    log = garden.log
  })

  afterEach(async () => {
    await cleanProject(garden.gardenDirPath)
  })

  it("should throw error if task not found", async () => {
    const name = "banana"

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { name },
          opts: withDefaultGlobalOpts({}),
        }),
      { type: "graph", contains: `Could not find Run action ${name}` }
    )
  })

  it("should return the task result", async () => {
    const name = "task-a"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    expect(res.result).to.be.eql({
      artifacts: [],
      moduleName: "module-a",
      taskName: "task-a",
      command: ["foo"],
      completedAt: now,
      log: "bla bla",
      outputs: { log: "bla bla" },
      success: true,
      startedAt: now,
      version: "1234",
    })
  })

  it("should include paths to artifacts if artifacts exist", async () => {
    const name = "task-a"

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const runAction = graph.getRun("task-a")
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
      footerLog: log,
      headerLog: log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.eql({
      artifacts: ["/foo/bar.txt", "/bas/bar.txt"],
      moduleName: "module-a",
      taskName: "task-a",
      command: ["foo"],
      completedAt: now,
      log: "bla bla",
      outputs: { log: "bla bla" },
      success: true,
      startedAt: now,
      version: "1234",
    })
  })

  it("should return result null if task result does not exist", async () => {
    const name = "task-c"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.null
  })
})
