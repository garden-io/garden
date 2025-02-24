/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestGarden } from "../../../helpers.js"
import { expectError, makeGarden, makeTempDir, noOpTestPlugin } from "../../../helpers.js"
import { preprocessActionConfig } from "../../../../src/graph/actions.js"
import type { RunActionConfig } from "../../../../src/actions/run.js"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../../../../src/constants.js"
import type tmp from "tmp-promise"
import { expect } from "chai"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"

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

  context("validation", () => {
    it("should reject unknown keys in action configs", async () => {
      const config: RunActionConfig = parseTemplateCollection({
        value: {
          internal: { basePath: tmpDir.path },
          timeout: DEFAULT_RUN_TIMEOUT_SEC,
          kind: "Run" as const,
          type: "exec",
          name: "run",
          spec: { command: ["echo", "foo"] },
          foo: "this should cause a validation error", // <-- we expect the action schema to reject this
        },
        source: { path: [] },
      })

      const router = await garden.getActionRouter()
      const actionTypes = await garden.getActionTypes()
      const definition = actionTypes[config.kind][config.type]?.spec

      await expectError(
        async () => {
          return preprocessActionConfig({
            garden,
            config,
            configsByKey: { "run.run": config },
            actionTypes,
            definition,
            router,
            linkedSources: {},
            mode: "default",
            log: garden.log,
          })
        },
        {
          contains: ["Error validating exec Run run 'run'", 'key "foo" is not allowed at path [foo]'],
        }
      )
    })
  })

  context("template strings", () => {
    context("include/exclude configs", () => {
      it("should resolve variables in 'exclude' config", async () => {
        const config: RunActionConfig = parseTemplateCollection({
          value: {
            internal: { basePath: tmpDir.path },
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
            kind: "Run" as const,
            type: "exec",
            name: "run",
            exclude: ["${var.anyVar}"],
            variables: {
              anyVar: "*/**",
            },
            spec: { command: ["echo", "foo"] },
          },
          source: { path: [] },
        })

        const router = await garden.getActionRouter()
        const actionTypes = await garden.getActionTypes()
        const definition = actionTypes[config.kind][config.type]?.spec

        const res = await preprocessActionConfig({
          garden,
          config,
          configsByKey: { "run.run": config },
          actionTypes,
          definition,
          router,
          linkedSources: {},
          mode: "default",
          log: garden.log,
        })

        expect(res.config.exclude).to.eql([config.variables?.["anyVar"]])
      })

      it("should resolve variables in 'include' config", async () => {
        const config: RunActionConfig = parseTemplateCollection({
          value: {
            internal: { basePath: tmpDir.path },
            timeout: DEFAULT_RUN_TIMEOUT_SEC,
            kind: "Run" as const,
            type: "exec",
            name: "run",
            include: ["${var.anyVar}"],
            variables: {
              anyVar: "*/**",
            },
            spec: { command: ["echo", "foo"] },
          },
          source: { path: [] },
        })

        const router = await garden.getActionRouter()
        const actionTypes = await garden.getActionTypes()
        const definition = actionTypes[config.kind][config.type]?.spec

        const res = await preprocessActionConfig({
          garden,
          config,
          configsByKey: { "run.run": config },
          actionTypes,
          definition,
          router,
          linkedSources: {},
          mode: "default",
          log: garden.log,
        })

        expect(res.config.include).to.eql([config.variables?.["anyVar"]])
      })
    })
  })
})
