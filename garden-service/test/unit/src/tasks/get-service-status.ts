/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import execa from "execa"

import { ProjectConfig } from "../../../../src/config/project"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { Garden } from "../../../../src/garden"
import { createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { joi } from "../../../../src/config/common"
import { ServiceState } from "../../../../src/types/service"
import { RunTaskParams } from "../../../../src/types/plugin/task/runTask"
import { expect } from "chai"
import { GetServiceStatusTask } from "../../../../src/tasks/get-service-status"
import { GetServiceStatusParams } from "../../../../src/types/plugin/service/getServiceStatus"

describe("GetServiceStatusTask", () => {
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
      environments: [{ name: "default", variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from tasks", async () => {
      const testPlugin = createGardenPlugin({
        name: "test",
        createModuleTypes: [
          {
            name: "test",
            docs: "test",
            serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
            handlers: {
              build: async () => ({}),
              getServiceStatus: async ({ service }: GetServiceStatusParams) => {
                return {
                  state: <ServiceState>"ready",
                  detail: {},
                  outputs: { log: service.spec.log },
                }
              },
              runTask: async ({ task }: RunTaskParams) => {
                const log = task.spec.log

                return {
                  taskName: task.name,
                  moduleName: task.module.name,
                  success: true,
                  outputs: { log },
                  command: [],
                  log,
                  startedAt: new Date(),
                  completedAt: new Date(),
                  version: task.module.version.versionString,
                }
              },
            },
          },
        ],
      })

      const garden = await Garden.factory(tmpDir.path, { config, plugins: [testPlugin] })

      garden["moduleConfigs"] = {
        test: {
          apiVersion: DEFAULT_API_VERSION,
          name: "test",
          type: "test",
          allowPublish: false,
          disabled: false,
          build: { dependencies: [] },
          outputs: {},
          path: tmpDir.path,
          serviceConfigs: [
            {
              name: "test-service",
              dependencies: ["test-task"],
              disabled: false,
              hotReloadable: false,
              spec: {
                log: "${runtime.tasks.test-task.outputs.log}",
              },
            },
          ],
          taskConfigs: [
            {
              name: "test-task",
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
      }

      const graph = await garden.getConfigGraph(garden.log)
      const testService = await graph.getService("test-service")

      const statusTask = new GetServiceStatusTask({
        garden,
        graph,
        service: testService,
        force: true,
        log: garden.log,
      })

      const result = await garden.processTasks([statusTask])

      expect(result[statusTask.getKey()]!.output.outputs).to.eql({ log: "test output" })
    })
  })
})
