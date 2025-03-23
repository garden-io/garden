/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestGarden } from "../../../helpers.js"
import { customizedTestPlugin, expectError, makeGarden, makeTempDir, noOpTestPlugin } from "../../../helpers.js"
import { preprocessActionConfig } from "../../../../src/graph/actions.js"
import type { RunActionConfig } from "../../../../src/actions/run.js"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../../../../src/constants.js"
import type tmp from "tmp-promise"
import { expect } from "chai"
import { parseTemplateCollection } from "../../../../src/template/templated-collections.js"
import type { BuildActionConfig } from "../../../../src/actions/build.js"
import { joi } from "../../../../src/config/common.js"

describe("preprocessActionConfig", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
  })

  beforeEach(async () => {
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
    context("implicit dependencies inferred from actoin output references", () => {
      context("a static output is referenced", () => {
        it("should inject an executed=true dependency when the ref is a Build", async () => {
          garden = await makeGarden(
            tmpDir,
            customizedTestPlugin({
              name: "test",
              createActionTypes: {
                Build: [
                  {
                    name: "test",
                    docs: "Test Build action with static output",
                    schema: joi.object(),
                    handlers: {},
                    staticOutputsSchema: joi.object().keys({ someOutput: joi.string() }),
                  },
                ],
              },
            })
          )

          const depBuildConfig: BuildActionConfig = parseTemplateCollection({
            value: {
              internal: { basePath: tmpDir.path },
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              kind: "Build" as const,
              type: "test",
              name: "build-dep",
              variables: {},
              spec: { command: ["echo", "build-dep"] },
            },
            source: { path: [] },
          })
          const runConfig: RunActionConfig = parseTemplateCollection({
            value: {
              internal: { basePath: tmpDir.path },
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              kind: "Run" as const,
              type: "exec",
              name: "with-refs",
              variables: {},
              spec: { command: ["echo", "${actions.build.build-dep.outputs.someOutput}"] },
            },
            source: { path: [] },
          })

          const router = await garden.getActionRouter()
          const actionTypes = await garden.getActionTypes()
          const definition = actionTypes[runConfig.kind][runConfig.type]?.spec

          const res = await preprocessActionConfig({
            garden,
            config: runConfig,
            configsByKey: { "run.with-refs": runConfig, "build.build-dep": depBuildConfig },
            actionTypes,
            definition,
            router,
            linkedSources: {},
            mode: "default",
            log: garden.log,
          })

          expect(res.dependencies).to.eql([
            {
              explicit: false,
              kind: "Build",
              name: "build-dep",
              needsExecutedOutputs: true, // <-----
              needsStaticOutputs: false, // <-----
              type: "test",
            },
          ])
        })
        it("should not inject an executed=true dependency when the ref is a Run", async () => {
          garden = await makeGarden(
            tmpDir,
            customizedTestPlugin({
              name: "test",
              createActionTypes: {
                Run: [
                  {
                    name: "test",
                    docs: "Run action with static output",
                    schema: joi.object(),
                    handlers: {},
                    staticOutputsSchema: joi.object().keys({ someOutput: joi.string() }),
                  },
                ],
              },
            })
          )

          const depRunConfig: RunActionConfig = parseTemplateCollection({
            value: {
              internal: { basePath: tmpDir.path },
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              kind: "Run" as const,
              type: "test",
              name: "run-dep",
              variables: {},
              spec: { command: ["echo", "run-dep"] },
            },
            source: { path: [] },
          })
          const runConfig: RunActionConfig = parseTemplateCollection({
            value: {
              internal: { basePath: tmpDir.path },
              timeout: DEFAULT_RUN_TIMEOUT_SEC,
              kind: "Run" as const,
              type: "exec",
              name: "with-refs",
              variables: {},
              spec: { command: ["echo", "${actions.run.run-dep.outputs.someOutput}"] },
            },
            source: { path: [] },
          })

          const router = await garden.getActionRouter()
          const actionTypes = await garden.getActionTypes()
          const definition = actionTypes[runConfig.kind][runConfig.type]?.spec

          const res = await preprocessActionConfig({
            garden,
            config: runConfig,
            configsByKey: { "run.with-refs": runConfig, "run.run-dep": depRunConfig },
            actionTypes,
            definition,
            router,
            linkedSources: {},
            mode: "default",
            log: garden.log,
          })

          expect(res.dependencies).to.eql([
            {
              explicit: false,
              kind: "Run",
              name: "run-dep",
              needsExecutedOutputs: false, // <-----
              needsStaticOutputs: true, // <-----
              type: "test",
            },
          ])
        })
      })
    })
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
