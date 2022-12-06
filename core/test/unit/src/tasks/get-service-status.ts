/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import execa from "execa"

import { ProjectConfig, defaultNamespace } from "../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { expect } from "chai"
import { TestGarden } from "../../../helpers"
import { defaultDotIgnoreFile } from "../../../../src/util/fs"
import { DeployTask } from "../../../../src/tasks/deploy"
import { createGardenPlugin, GardenPlugin } from "../../../../src/plugin/plugin"
import { joi } from "../../../../src/config/common"
import { ActionConfig } from "../../../../src/actions/types"

// TODO-G2: consider merging it with ./deploy.ts
describe("DeployTask", () => {
  let tmpDir: tmp.DirectoryResult
  let config: ProjectConfig
  let testPlugin: GardenPlugin
  let garden: TestGarden

  const actionConfig: ActionConfig[] = [
    {
      name: "test-deploy",
      type: "test",
      kind: "Deploy",
      dependencies: ["run.test-run"],
      internal: {
        basePath: "foo",
      },
      spec: {
        log: "${runtime.tasks.test-run.outputs.log}",
      },
    },
    {
      name: "test-run",
      type: "test",
      kind: "Run",
      internal: {
        basePath: "foo",
      },
      spec: {
        log: "cool log",
      },
    },
  ]

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })

    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })

    config = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: tmpDir.path,
      defaultEnvironment: "default",
      dotIgnoreFile: defaultDotIgnoreFile,
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }
    testPlugin = createGardenPlugin({
      name: "test",
      createActionTypes: {
        Deploy: [
          {
            name: "test",
            docs: "asd",
            schema: joi.object(),
            handlers: {
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
              getResult: async (params) => ({
                detail: {
                  completedAt: new Date(),
                  log: params.action.getSpec().log,
                  startedAt: new Date(),
                  success: true,
                },
                outputs: {},
                state: "ready",
              }),
            },
          },
        ],
      },
    })

    garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from tasks", async () => {
      garden.setActionConfigs([], actionConfig)

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("test-deploy")

      const deployTask = new DeployTask({
        garden,
        graph,
        action,
        force: true,
        fromWatch: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      const result = await garden.processTasks({ tasks: [deployTask], throwOnError: true })

      expect(result.results.getResult(deployTask)?.outputs).to.eql({ log: "cool log" })
    })

    it("should set status to unknown if runtime variables can't be resolved", async () => {
      garden.setActionConfigs([], actionConfig)

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("test-service")

      const deployTask = new DeployTask({
        garden,
        graph,
        action,
        force: true,
        fromWatch: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      const result = await garden.processTasks({ tasks: [deployTask], throwOnError: true })

      expect(result.results.getResult(deployTask)?.result?.state).to.equal("unknown")
    })
  })
})
