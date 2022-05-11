/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expect } from "chai"
import { TestGarden } from "../../../helpers"
import { ProjectConfig, defaultNamespace } from "../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import execa from "execa"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { joi } from "../../../../src/config/common"
import { RunTaskParams, RunTaskResult } from "../../../../src/types/plugin/task/runTask"
import { TaskTask } from "../../../../src/tasks/task"
import { GardenTask } from "../../../../src/types/task"
import { GetTaskResultParams } from "../../../../src/types/plugin/task/getTaskResult"

describe("TaskTask", () => {
  let tmpDir: tmp.DirectoryResult
  let config: ProjectConfig

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })

    await execa("git", ["init"], { cwd: tmpDir.path })

    config = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: tmpDir.path,
      defaultEnvironment: "default",
      dotIgnoreFiles: [],
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    let cache: { [key: string]: RunTaskResult } = {}

    beforeEach(() => {
      cache = {}
    })

    const getKey = (task: GardenTask) => {
      return `${task.name}-${task.version}`
    }

    const testPlugin = createGardenPlugin({
      name: "test",
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
          handlers: {
            build: async () => ({}),
            runTask: async ({ task }: RunTaskParams) => {
              const log = new Date().getTime().toString()

              const result = {
                taskName: task.name,
                moduleName: task.module.name,
                success: true,
                outputs: { log },
                command: [],
                log,
                startedAt: new Date(),
                completedAt: new Date(),
                version: task.version,
              }

              cache[getKey(task)] = result

              return result
            },
            getTaskResult: async ({ task }: GetTaskResultParams) => {
              return cache[getKey(task)] || null
            },
          },
        },
      ],
    })

    it("should cache results when cacheResult=true", async () => {
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          path: tmpDir.path,
          serviceConfigs: [],
          taskConfigs: [
            {
              name: "test",
              cacheResult: true,
              dependencies: [],
              disabled: false,
              spec: {},
              timeout: 10,
            },
          ],
          testConfigs: [],
          spec: {},
        },
      ])

      let graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      let taskTask = new TaskTask({
        garden,
        graph,
        task: graph.getTask("test"),
        force: false,
        forceBuild: false,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      let result = await garden.processTasks([taskTask], { throwOnError: true })
      const logA = result[taskTask.getKey()]!.output.outputs.log

      garden["taskGraph"].clearCache()

      result = await garden.processTasks([taskTask], { throwOnError: true })
      const logB = result[taskTask.getKey()]!.output.outputs.log

      // Expect the same log from the second run
      expect(logA).to.equal(logB)
    })

    it("should not cache results when cacheResult=false", async () => {
      const garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          path: tmpDir.path,
          serviceConfigs: [],
          taskConfigs: [
            {
              name: "test",
              cacheResult: false,
              dependencies: [],
              disabled: false,
              spec: {},
              timeout: 10,
            },
          ],
          testConfigs: [],
          spec: {},
        },
      ])

      let graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      let taskTask = new TaskTask({
        garden,
        graph,
        task: graph.getTask("test"),
        force: false,
        forceBuild: false,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      let result = await garden.processTasks([taskTask], { throwOnError: true })
      const logA = result[taskTask.getKey()]!.output.outputs.log

      garden["taskGraph"].clearCache()

      result = await garden.processTasks([taskTask], { throwOnError: true })
      const logB = result[taskTask.getKey()]!.output.outputs.log

      // Expect a different log from the second run
      expect(logA).to.not.equal(logB)
    })
  })
})
