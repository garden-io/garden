/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import tmp from "tmp-promise"
import { withDefaultGlobalOpts, TestGarden, createProjectConfig } from "../../../../helpers"
import { GetOutputsCommand } from "../../../../../src/commands/get/get-outputs"
import { ProjectConfig } from "../../../../../src/config/project"
import { createGardenPlugin } from "../../../../../src/plugin/plugin"
import { exec } from "../../../../../src/util/util"

describe("GetOutputsCommand", () => {
  let tmpDir: tmp.DirectoryResult
  let projectConfig: ProjectConfig

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })

    await exec("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })

    projectConfig = createProjectConfig({
      path: tmpDir.path,
      providers: [{ name: "test" }],
    })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("should resolve and return defined project outputs", async () => {
    const plugin = createGardenPlugin({
      name: "test",
      handlers: {
        async getEnvironmentStatus() {
          return { ready: true, outputs: { test: "test-value" } }
        },
      },
    })

    projectConfig.outputs = [{ name: "test", value: "${providers.test.outputs.test}" }]

    const garden = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: projectConfig,
    })

    const log = garden.log
    const command = new GetOutputsCommand()

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    expect(res.result).to.eql({
      test: "test-value",
    })
  })
})
