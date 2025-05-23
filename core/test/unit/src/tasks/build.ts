/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"
import { expect } from "chai"
import type { ProjectConfig } from "../../../../src/config/project.js"
import { freezeTime, createProjectConfig, makeTempDir, TestGarden } from "../../../helpers.js"
import type { GardenPluginSpec } from "../../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { joi } from "../../../../src/config/common.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import { BuildTask } from "../../../../src/tasks/build.js"

describe("BuildTask", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let graph: ConfigGraph
  let config: ProjectConfig
  let testPlugin: GardenPluginSpec

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })

    config = createProjectConfig({
      path: tmpDir.path,
      providers: [{ name: "test" }],
    })

    testPlugin = createGardenPlugin({
      name: "test",
      docs: "asd",
      createActionTypes: {
        Build: [
          {
            name: "test",
            docs: "asd",
            schema: joi.object(),
            handlers: {
              getStatus: async (_) => {
                return {
                  state: "ready",
                  detail: {
                    state: "ready",
                    runtime: ACTION_RUNTIME_LOCAL,
                    details: {},
                  },
                  outputs: {},
                }
              },
              build: async (_) => {
                return {
                  state: "ready",
                  detail: {
                    runtime: ACTION_RUNTIME_LOCAL,
                  },
                  outputs: {},
                }
              },
            },
          },
        ],
      },
    })
    garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

    garden.setPartialActionConfigs([
      {
        name: "test-build",
        type: "test",
        kind: "Build",
        internal: {
          basePath: garden.projectRoot,
        },
        dependencies: [],
        disabled: false,

        spec: {
          log: "",
        },
      },
    ])

    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    it("should emit buildStatus events", async () => {
      garden.events.eventLog = []
      const action = graph.getBuild("test-build")

      const buildTask = new BuildTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const now = freezeTime().toISOString()
      await garden.processTasks({ tasks: [buildTask], throwOnError: true })

      const buildStatusEvents = garden.events.eventLog.filter((e) => e.name === "buildStatus")
      const actionVersion = buildStatusEvents[0].payload.actionVersion
      const actionUid = buildStatusEvents[0].payload.actionUid

      expect(buildStatusEvents).to.eql([
        {
          name: "buildStatus",
          payload: {
            actionName: "test-build",
            actionVersion,
            actionType: "test",
            actionKind: "build",
            actionUid,
            moduleName: null,
            startedAt: now,
            force: true,
            operation: "getStatus",
            state: "getting-status",
            sessionId: garden.sessionId,
            runtime: undefined, // runtime unknown at this stage
            status: { state: "unknown" },
          },
        },
        {
          name: "buildStatus",
          payload: {
            actionName: "test-build",
            actionVersion,
            actionType: "test",
            actionKind: "build",
            actionUid,
            moduleName: null,
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "getStatus",
            state: "cached",
            sessionId: garden.sessionId,
            runtime: { actual: { kind: "local" } },
            status: { state: "fetched" },
          },
        },
        {
          name: "buildStatus",
          payload: {
            actionName: "test-build",
            actionVersion,
            actionType: "test",
            actionKind: "build",
            actionUid,
            moduleName: null,
            startedAt: now,
            force: true,
            operation: "process",
            state: "processing",
            sessionId: garden.sessionId,
            runtime: { actual: { kind: "local" } },
            status: { state: "building" },
          },
        },
        {
          name: "buildStatus",
          payload: {
            actionName: "test-build",
            actionVersion,
            actionType: "test",
            actionKind: "build",
            actionUid,
            moduleName: null,
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "process",
            state: "ready",
            sessionId: garden.sessionId,
            runtime: { actual: { kind: "local" } },
            status: { state: "built" },
          },
        },
      ])
    })
    it("should NOT emit buildStatus events if statusOnly=true", async () => {
      garden.events.eventLog = []
      const action = graph.getBuild("test-build")

      const buildTask = new BuildTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      await garden.processTasks({ tasks: [buildTask], throwOnError: true, statusOnly: true })

      const buildStatusEvents = garden.events.eventLog.filter((e) => e.name === "buildStatus")

      expect(buildStatusEvents).to.eql([])
    })
  })
})
