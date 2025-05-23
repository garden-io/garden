/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type tmp from "tmp-promise"

import type { ProjectConfig } from "../../../../src/config/project.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { GardenPluginSpec } from "../../../../src/plugin/plugin.js"
import { ACTION_RUNTIME_LOCAL, createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { DeployTask } from "../../../../src/tasks/deploy.js"
import { expect } from "chai"
import { createProjectConfig, freezeTime, makeTempDir, TestGarden } from "../../../helpers.js"
import { joi } from "../../../../src/config/common.js"

describe("DeployTask", () => {
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
              build: async (_) => ({
                state: "ready",
                detail: {
                  runtime: ACTION_RUNTIME_LOCAL,
                },
                outputs: {},
              }),
            },
          },
        ],
        Deploy: [
          {
            name: "test",
            docs: "asd",
            schema: joi.object(),
            handlers: {
              deploy: async (params) => ({
                state: "ready",
                detail: { detail: {}, state: "ready" },
                outputs: { log: params.action.getSpec().log },
              }),
              getStatus: async (params) => ({
                state: "ready",
                detail: { detail: {}, state: "ready" },
                outputs: { log: params.action.getSpec().log },
              }),
            },
          },
        ],
        Run: [
          {
            name: "test",
            docs: "asdü",
            schema: joi.object(),
            handlers: {
              run: async (params) => {
                const log = params.action.getSpec().log

                return {
                  detail: {
                    completedAt: new Date(),
                    log,
                    startedAt: new Date(),
                    success: true,
                  },
                  outputs: {
                    log,
                  },
                  state: "ready",
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
        name: "test-deploy",
        type: "test",
        kind: "Deploy",
        internal: {
          basePath: garden.projectRoot,
        },
        dependencies: [
          { kind: "Deploy", name: "dep-deploy" },
          { kind: "Run", name: "test-run" },
        ],
        disabled: false,

        spec: {
          log: "${runtime.tasks.test-run.outputs.log}",
        },
      },
      {
        name: "dep-deploy",
        type: "test",
        kind: "Deploy",
        internal: {
          basePath: garden.projectRoot,
        },
        dependencies: [],
        disabled: false,
        spec: {
          log: "apples and pears",
        },
      },
      {
        name: "test-run",
        type: "test",
        kind: "Run",
        dependencies: [],
        disabled: false,
        timeout: 10,
        internal: {
          basePath: garden.projectRoot,
        },
        spec: {
          log: "test output",
        },
      },
    ])

    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("resolveProcessDependencies", () => {
    it("should always return deploy action's dependencies having force = false", async () => {
      const action = graph.getDeploy("test-deploy")

      const forcedDeployTask = new DeployTask({
        garden,
        graph,
        action,
        force: true,
        forceBuild: false,

        log: garden.log,
      })

      expect(forcedDeployTask.resolveProcessDependencies({ status: null }).find((dep) => dep.type === "run")!.force).to
        .be.false

      const unforcedDeployTask = new DeployTask({
        garden,
        graph,
        action,
        force: false,
        forceBuild: false,

        log: garden.log,
      })

      expect(unforcedDeployTask.resolveProcessDependencies({ status: null }).find((dep) => dep.type === "run")!.force)
        .to.be.false
    })
  })

  describe("process", () => {
    it("should emit deployStatus events", async () => {
      garden.events.eventLog = []
      const action = graph.getDeploy("test-deploy")

      const deployTask = new DeployTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      const now = freezeTime().toISOString()
      await garden.processTasks({ tasks: [deployTask], throwOnError: true })

      const deployStatusEvents = garden.events.eventLog
        .filter((e) => e.name === "deployStatus")
        // We ignore status events for dependencies since it works the same.
        .filter((e) => e.payload.actionName === "test-deploy")
      const actionVersion = deployStatusEvents[0].payload.actionVersion
      const actionUid = deployStatusEvents[0].payload.actionUid

      expect(deployStatusEvents).to.eql([
        {
          name: "deployStatus",
          payload: {
            actionName: "test-deploy",
            actionVersion,
            actionType: "test",
            actionKind: "deploy",
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
          name: "deployStatus",
          payload: {
            actionName: "test-deploy",
            actionVersion,
            actionType: "test",
            actionKind: "deploy",
            actionUid,
            moduleName: null,
            startedAt: now,
            completedAt: now,
            force: true,
            operation: "getStatus",
            state: "cached",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: {
              forwardablePorts: [],
              mode: "default",
              outputs: {},
              state: "ready",
            },
          },
        },
        {
          name: "deployStatus",
          payload: {
            actionName: "test-deploy",
            actionVersion,
            actionType: "test",
            actionKind: "deploy",
            actionUid,
            moduleName: null,
            force: true,
            operation: "process",
            startedAt: now,
            state: "processing", // <--- Force is set to true so we deploy even if the previous status is cached
            sessionId: garden.sessionId,
            runtime: undefined,
            status: { state: "deploying" },
          },
        },
        {
          name: "deployStatus",
          payload: {
            actionName: "test-deploy",
            actionVersion,
            actionType: "test",
            actionKind: "deploy",
            actionUid,
            moduleName: null,
            force: true,
            operation: "process",
            startedAt: now,
            completedAt: now,
            state: "ready",
            sessionId: garden.sessionId,
            runtime: undefined,
            status: {
              forwardablePorts: [],
              mode: "default",
              outputs: {},
              state: "ready",
            },
          },
        },
      ])
    })
    it("should NOT emit deployStatus events if statusOnly=true", async () => {
      garden.events.eventLog = []
      const action = graph.getDeploy("test-deploy")

      const deployTask = new DeployTask({
        garden,
        log: garden.log,
        graph,
        action,
        force: true,
        forceBuild: false,
      })

      await garden.processTasks({ tasks: [deployTask], throwOnError: true, statusOnly: true })

      const deployStatusEvents = garden.events.eventLog.filter((e) => e.name === "deployStatus")
      expect(deployStatusEvents).to.eql([])
    })
  })
})
