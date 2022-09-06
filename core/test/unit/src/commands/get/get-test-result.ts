/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  expectError,
  withDefaultGlobalOpts,
  makeTestGardenA,
  cleanProject,
  TestGarden,
  customizedTestPlugin,
} from "../../../../helpers"
import { GetTestResultCommand } from "../../../../../src/commands/get/get-test-result"
import { expect } from "chai"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { getArtifactKey } from "../../../../../src/util/artifacts"
import { join } from "path"
import { writeFile } from "fs-extra"
import { execTestActionSchema } from "../../../../../src/plugins/exec/config"

const now = new Date()

const testResults = {
  unit: {
    moduleName: "module-a",
    command: [],
    completedAt: now,
    log: "bla bla",
    outputs: {
      log: "bla bla",
    },
    success: true,
    startedAt: now,
    testName: "unit",
    version: "1234",
  },
  integration: null,
}

// TODO-G2: remove commented code and ensure proper actions config
// const testPlugin = createGardenPlugin({
//   name: "test-plugin",
//   createModuleTypes: [
//     {
//       name: "test",
//       docs: "test",
//       schema: joi.object(),
//       handlers: {
//         configure: configureTestModule,
//         getTestResult: async (params: GetTestResultParams) => testResults[params.test.name],
//       },
//     },
//   ],
// })

const testPlugin = customizedTestPlugin({
  createActionTypes: {
    Test: [
      {
        name: "test",
        docs: "Test Test action",
        schema: execTestActionSchema(),
        handlers: {
          getResult: async (params) => testResults[params.action.name],
        },
      },
    ],
  },
})

describe("GetTestResultCommand", () => {
  let garden: TestGarden
  let log: LogEntry
  const command = new GetTestResultCommand()
  const moduleName = "module-a"

  beforeEach(async () => {
    garden = await makeTestGardenA([testPlugin], { noCache: true })
    log = garden.log
  })

  afterEach(async () => {
    await cleanProject(garden.gardenDirPath)
  })

  it("should throw error if test not found", async () => {
    const name = "banana"

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { name, moduleTestName: moduleName },
          opts: withDefaultGlobalOpts({}),
        }),
      "not-found"
    )
  })

  it("should return the test result", async () => {
    const name = "unit"

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name, moduleTestName: moduleName },
      opts: withDefaultGlobalOpts({}),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    expect(res.result).to.eql({
      artifacts: [],
      moduleName: "module-a",
      command: [],
      completedAt: now,
      log: "bla bla",
      outputs: {
        log: "bla bla",
      },
      success: true,
      startedAt: now,
      testName: "unit",
      version: "1234",
    })
  })

  it("should include paths to artifacts if artifacts exist", async () => {
    const name = "unit"

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
    const testAction = graph.getTest("module-a-unit")
    const artifactKey = getArtifactKey("test", name, testAction.versionString())
    const metadataPath = join(garden.artifactsPath, `.metadata.${artifactKey}.json`)
    const metadata = {
      key: artifactKey,
      files: ["/foo/bar.txt", "/bas/bar.txt"],
    }

    await writeFile(metadataPath, JSON.stringify(metadata))

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name, moduleTestName: moduleName },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.eql({
      artifacts: ["/foo/bar.txt", "/bas/bar.txt"],
      moduleName: "module-a",
      command: [],
      completedAt: now,
      log: "bla bla",
      outputs: {
        log: "bla bla",
      },
      success: true,
      startedAt: now,
      testName: "unit",
      version: "1234",
    })
  })

  it("should return result null if test result does not exist", async () => {
    const name = "integration"

    const res = await command.action({
      garden,
      log,
      footerLog: log,
      headerLog: log,
      args: { name, moduleTestName: moduleName },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res.result).to.be.null
  })
})
