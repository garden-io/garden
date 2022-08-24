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
import { createGardenPlugin } from "../../../../src/plugin/plugin"
import { RunTask } from "../../../../src/tasks/run"
import { GardenTask } from "../../../../src/types/task"
import { defaultDotIgnoreFile } from "../../../../src/util/fs"
import { GetRunResult } from "../../../../src/plugin/handlers/run/get-result"
import { execRunActionSchema } from "../../../../src/plugins/exec/config"

describe("RunTask", () => {
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
    let cache: { [key: string]: GetRunResult } = {}

    beforeEach(() => {
      cache = {}
    })

    const getKey = (task: GardenTask) => {
      return `${task.name}-${task.version}`
    }

    const testPlugin = createGardenPlugin({
      name: "test",
      createActionTypes: {
        Run: [
          {
            name: "test",
            docs: "test",
            schema: execRunActionSchema(),
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
                return cache[params.action.key()]
              },
            },
          },
        ],
      },
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
      let taskTask = new RunTask({
        garden,
        graph,
        action: graph.getRun("test"),
        force: false,
        forceBuild: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      let result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logA = result[taskTask.getBaseKey()]!.result.outputs.log

      garden["taskGraph"].clearCache()

      result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logB = result[taskTask.getBaseKey()]!.result.outputs.log

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
      let taskTask = new RunTask({
        garden,
        graph,
        action: graph.getRun("test"),
        force: false,
        forceBuild: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
        fromWatch: false,
      })

      let result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logA = result[taskTask.getBaseKey()]!.result.outputs.log

      result = await garden.processTasks({ tasks: [taskTask], throwOnError: true })
      const logB = result[taskTask.getBaseKey()]!.result.outputs.log

      // Expect a different log from the second run
      expect(logA).to.not.equal(logB)
    })
  })
})
