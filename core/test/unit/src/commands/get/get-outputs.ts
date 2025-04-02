/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type tmp from "tmp-promise"
import { withDefaultGlobalOpts, TestGarden, createProjectConfig, makeTempDir } from "../../../../helpers.js"
import { GetOutputsCommand } from "../../../../../src/commands/get/get-outputs.js"
import type { ProjectConfig } from "../../../../../src/config/project.js"
import { createGardenPlugin } from "../../../../../src/plugin/plugin.js"
import { parseTemplateCollection } from "../../../../../src/template/templated-collections.js"

describe("GetOutputsCommand", () => {
  let tmpDir: tmp.DirectoryResult
  let projectConfig: ProjectConfig

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })

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
        async prepareEnvironment() {
          return { status: { ready: true, outputs: { test: "test-value" } } }
        },
      },
    })

    projectConfig.outputs = parseTemplateCollection({
      value: [{ name: "test", value: "${providers.test.outputs.test}" }],
      source: { path: [] },
    })

    const garden = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: projectConfig,
    })

    const log = garden.log
    const command = new GetOutputsCommand()

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(command.outputsSchema().validate(res.result).error).to.be.undefined

    expect(res.result).to.eql({
      test: "test-value",
    })
  })
})
