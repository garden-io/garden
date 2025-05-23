/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"
import { expect } from "chai"
import { createProjectConfig, freezeTime, makeTempDir, TestGarden } from "../../../helpers.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { RunTask } from "../../../../src/tasks/run.js"
import type { GetRunResult } from "../../../../src/plugin/handlers/Run/get-result.js"
import { joi } from "../../../../src/config/common.js"

describe("RunTask", () => {
  let tmpDir: tmp.DirectoryResult
  let config: ProjectConfig

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })

    config = createProjectConfig({
      path: tmpDir.path,
      providers: [{ name: "test" }],
    })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    let cache: { [key: string]: GetRunResult } = {}

    beforeEach(() => {
      cache = {}
    })

    const testPlugin = createGardenPlugin({
      name: "test",
      createActionTypes: {
        Run: [
          {
            name: "test",
            docs: "test",
            schema: joi.object(),
            handlers: {
              run: async (params) => {
                const log = new Date().getTime().toString()

                const result: GetRunResult = {
                  state: "ready",
                  detail: {
                    completedAt: new Date(),
                    log: params.action.getSpec().command.join(" "),
                    startedAt: new Date(),
                    success: true,
                  },
                  outputs: { log },
                }

                cache[params.action.key()] = result

                return result
              },
              getResult: async (params) => {
                return (
                  cache[params.action.key()] || {
                    state: "not-ready",
                    outputs: {},
                  }
                )
              },
            },
          },
        ],
      },
    })

    it("should cache results", async () => {
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden.setPartialActionConfigs([
        {
          name: "test",
          type: "test",
          kind: "Run",
          dependencies: [],
          disabled: false,
          timeout: 10,
          internal: {
            basePath: "./",
          },
          spec: {
            command: ["echo", "this is a test lalala kumiko"],
          },
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const taskTask = new RunTask({
        garden,
        graph,
        action: graph.getRun("test"),
        force: false,
        forceBuild: false,
        log: garden.log,
      })

      let result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logA = result.results.getAll()[0]?.outputs

      result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logB = result.results.getAll()[0]?.outputs

      // Expect the same log from the second run
      expect(logA).to.eql(logB)
    })

    it("should emit runStatus events", async () => {
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })
      garden.setPartialActionConfigs([
        {
          name: "test",
          type: "test",
          kind: "Run",
          dependencies: [],
          disabled: false,
          timeout: 10,
          internal: {
            basePath: "./",
          },
          spec: {
            command: ["echo", "this is a test lalala kumiko"],
          },
        },
      ])
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getRun("test")

      const runTask = new RunTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const now = freezeTime().toISOString()
      await garden.processTasks({ tasks: [runTask], throwOnError: true })

      const runStatusEvents = garden.events.eventLog.filter((e) => e.name === "runStatus")
      const actionVersion = runStatusEvents[0].payload.actionVersion
      const actionUid = runStatusEvents[0].payload.actionUid

      expect(runStatusEvents).to.eql([
        {
          name: "runStatus",
          payload: {
            actionName: "test",
            actionVersion,
            actionType: "test",
            actionKind: "run",
            actionUid,
            moduleName: null,
            startedAt: now,
            force: true,
            operation: "getStatus",
            state: "getting-status",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "unknown" },
          },
        },
        {
          name: "runStatus",
          payload: {
            actionName: "test",
            actionVersion,
            actionType: "test",
            actionKind: "run",
            actionUid,
            moduleName: null,
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "getStatus",
            state: "not-ready",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "unknown" },
          },
        },
        {
          name: "runStatus",
          payload: {
            actionName: "test",
            actionVersion,
            actionType: "test",
            actionKind: "run",
            actionUid,
            moduleName: null,
            force: true,
            operation: "process",
            startedAt: now,
            state: "processing", // <--- Force is set to true so we run even if the previous status is cached
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "running" },
          },
        },
        {
          name: "runStatus",
          payload: {
            actionName: "test",
            actionVersion,
            actionType: "test",
            actionKind: "run",
            actionUid,
            moduleName: null,
            force: true,
            operation: "process",
            startedAt: now,
            completedAt: now,
            state: "ready",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "succeeded" },
          },
        },
      ])
    })
    it("should NOT emit runStatus events if statusOnly=true", async () => {
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })
      garden.setPartialActionConfigs([
        {
          name: "test",
          type: "test",
          kind: "Run",
          dependencies: [],
          disabled: false,
          timeout: 10,
          internal: {
            basePath: "./",
          },
          spec: {
            command: ["echo", "this is a test lalala kumiko"],
          },
        },
      ])
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getRun("test")

      const runTask = new RunTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      await garden.processTasks({ tasks: [runTask], throwOnError: true, statusOnly: true })

      const runStatusEvents = garden.events.eventLog.filter((e) => e.name === "runStatus")

      expect(runStatusEvents).to.eql([])
    })
  })
})
