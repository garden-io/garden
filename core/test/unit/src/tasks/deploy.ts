/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import execa from "execa"

import { ProjectConfig } from "../../../../src/config/project"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { DeployTask } from "../../../../src/tasks/deploy"
import { expect } from "chai"
import { createProjectConfig, makeTempDir, TestGarden } from "../../../helpers"
import { joi } from "../../../../src/config/common"
import { ActionConfig } from "../../../../src/actions/types"

describe("DeployTask", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let graph: ConfigGraph
  let config: ProjectConfig
  let testPlugin: GardenPlugin

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
              build: async (_) => ({ state: "ready", detail: {}, outputs: {} }),
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
                detail: { detail: {}, deployState: "ready" },
                outputs: { log: params.action.getSpec().log },
              }),
              getStatus: async (params) => ({
                state: "ready",
                detail: { detail: {}, deployState: "ready" },
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

    garden.setActionConfigs([
      {
        name: "test-deploy",
        type: "test",
        kind: "Deploy",
        internal: {
          basePath: "foo",
        },
        dependencies: ["deploy.dep-deploy", "run.test-run"],
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
          basePath: "foo",
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
          basePath: "./",
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
    // TODO-G2B: this might make sense to implement but is not strictly needed
    it.skip("should always return deploy action's dependencies having force = false", async () => {
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
})
