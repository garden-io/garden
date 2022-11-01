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
import { customizedTestPlugin, TestGarden, testPlugin as getTestPlugin } from "../../../helpers"
import { defaultDotIgnoreFile } from "../../../../src/util/fs"
import { DeployTask } from "../../../../src/tasks/deploy"

// TODO-G2: consider merging it with ./deploy.ts
describe("DeployTask", () => {
  let tmpDir: tmp.DirectoryResult
  let config: ProjectConfig

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
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from tasks", async () => {
      // const testPlugin = createGardenPlugin({
      //   name: "test",
      //   createModuleTypes: [
      //     {
      //       name: "test",
      //       docs: "test",
      //       serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
      //       handlers: {
      //         build: async () => ({}),
      //         getServiceStatus: async ({ service }: GetServiceStatusParams) => {
      //           return {
      //             state: <ServiceState>"ready",
      //             detail: {},
      //             outputs: { log: service.spec.log },
      //           }
      //         },
      //         getTaskResult: async ({ task }: GetTaskResultParams) => {
      //           const log = task.spec.log
      //
      //           return {
      //             taskName: task.name,
      //             moduleName: task.module.name,
      //             success: true,
      //             outputs: { log },
      //             command: [],
      //             log,
      //             startedAt: new Date(),
      //             completedAt: new Date(),
      //             version: task.version,
      //           }
      //         },
      //       },
      //     },
      //   ],
      // })
      // TODO-G2: customize behaviour to inject outputs if necessary, see getTaskResult in the commented code above
      const testPlugin = customizedTestPlugin({})
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          path: tmpDir.path,
          serviceConfigs: [
            {
              name: "test-service",
              dependencies: ["test-task"],
              disabled: false,

              spec: {
                log: "${runtime.tasks.test-task.outputs.log}",
              },
            },
          ],
          taskConfigs: [
            {
              name: "test-task",
              cacheResult: true,
              dependencies: [],
              disabled: false,
              spec: {
                log: "test output",
              },
              timeout: 10,
            },
          ],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      ])

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

      expect(result.results.getResult(deployTask)?.outputs).to.eql({ log: "test output" })
    })

    it("should set status to unknown if runtime variables can't be resolved", async () => {
      const testPlugin = getTestPlugin()
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden.setActionConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          path: tmpDir.path,
          serviceConfigs: [
            {
              name: "test-service",
              dependencies: ["test-task"],
              disabled: false,

              spec: {
                log: "${runtime.tasks.test-task.outputs.log}",
              },
            },
          ],
          taskConfigs: [
            {
              name: "test-task",
              cacheResult: true,
              dependencies: [],
              disabled: false,
              spec: {
                log: "test output",
              },
              timeout: 10,
            },
          ],
          testConfigs: [],
          spec: { bla: "fla" },
        },
      ])

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
