/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeGarden, makeTempDir, noOpTestPlugin, TestGarden } from "../../../helpers"
import { preprocessActionConfig } from "../../../../src/graph/actions"
import { RunActionConfig } from "../../../../src/actions/run"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../../../../src/constants"
import tmp from "tmp-promise"
import { expect } from "chai"

// TODO: add more tests
describe("preprocessActionConfig", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
    garden = await makeGarden(tmpDir, noOpTestPlugin())
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  context("template strings", () => {
    context("include/exclude configs", () => {
      it("should resolve variables in 'exclude' config", async () => {
        const config: RunActionConfig = {
          internal: { basePath: tmpDir.path },
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          kind: "Run",
          type: "exec",
          name: "run",
          exclude: ["${var.anyVar}"],
          variables: {
            anyVar: "*/**",
          },
          spec: { command: ["echo", "foo"] },
        }
        const router = await garden.getActionRouter()
        const res = await preprocessActionConfig({
          garden,
          config,
          router,
          mode: "default",
          log: garden.log,
        })

        expect(res.config.exclude).to.eql([config.variables?.["anyVar"]])
      })

      it("should resolve variables in 'include' config", async () => {
        const config: RunActionConfig = {
          internal: { basePath: tmpDir.path },
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          kind: "Run",
          type: "exec",
          name: "run",
          include: ["${var.anyVar}"],
          variables: {
            anyVar: "*/**",
          },
          spec: { command: ["echo", "foo"] },
        }
        const router = await garden.getActionRouter()
        const res = await preprocessActionConfig({
          garden,
          config,
          router,
          mode: "default",
          log: garden.log,
        })

        expect(res.config.include).to.eql([config.variables?.["anyVar"]])
      })
    })
  })
})
