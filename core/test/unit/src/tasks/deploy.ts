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
import { Garden } from "../../../../src/garden"
import { ConfigGraph } from "../../../../src/config-graph"
import { createGardenPlugin, GardenPlugin } from "../../../../src/types/plugin/plugin"
import { joi } from "../../../../src/config/common"
import { ServiceState } from "../../../../src/types/service"
import { DeployTask } from "../../../../src/tasks/deploy"
import { DeployServiceParams } from "../../../../src/types/plugin/service/deployService"
import { RunTaskParams } from "../../../../src/types/plugin/task/runTask"
import { expect } from "chai"
import { TestGarden } from "../../../helpers"

describe("DeployTask", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: Garden
  let graph: ConfigGraph
  let config: ProjectConfig
  let testPlugin: GardenPlugin

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

    testPlugin = createGardenPlugin({
      name: "test",
      createModuleTypes: [
        {
          name: "test",
          docs: "test",
          serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
          handlers: {
            build: async () => ({}),
            getServiceStatus: async () => {
              return {
                state: <ServiceState>"missing",
                detail: {},
                outputs: {},
              }
            },
            deployService: async ({ service }: DeployServiceParams) => {
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
                version: task.version,
              }
            },
          },
        },
      ],
    })

    garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

    garden["moduleConfigs"] = {
      test: {
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
            dependencies: ["dep-service", "test-task"],
            disabled: false,
            hotReloadable: false,
            spec: {
              log: "${runtime.tasks.test-task.outputs.log}",
            },
          },
          {
            name: "dep-service",
            dependencies: [],
            disabled: false,
            hotReloadable: false,
            spec: {
              log: "apples and pears",
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
    }

    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("getDependencies", () => {
    it("should always return task dependencies having force = false", async () => {
      const testService = graph.getService("test-service")

      const forcedDeployTask = new DeployTask({
        garden,
        graph,
        service: testService,
        force: true,
        forceBuild: false,
        fromWatch: false,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      expect((await forcedDeployTask.resolveDependencies()).find((dep) => dep.type === "task")!.force).to.be.false

      const unforcedDeployTask = new DeployTask({
        garden,
        graph,
        service: testService,
        force: false,
        forceBuild: false,
        fromWatch: false,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      expect((await unforcedDeployTask.resolveDependencies()).find((dep) => dep.type === "task")!.force).to.be.false

      const deployTaskFromWatch = new DeployTask({
        garden,
        graph,
        service: testService,
        force: false,
        forceBuild: false,
        fromWatch: true,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      expect((await deployTaskFromWatch.resolveDependencies()).find((dep) => dep.type === "task")!.force).to.be.false
    })

    context("when skipRuntimeDependencies = true", () => {
      it("doesn't return deploy or task dependencies", async () => {
        const testService = graph.getService("test-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          service: testService,
          force: true,
          forceBuild: false,
          fromWatch: false,
          log: garden.log,
          skipRuntimeDependencies: true, // <-----
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const deps = await deployTask.resolveDependencies()
        expect(deps.find((dep) => dep.type === "deploy" || dep.type === "task")).to.be.undefined
      })
    })
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from tasks", async () => {
      const testService = graph.getService("test-service")

      const deployTask = new DeployTask({
        garden,
        graph,
        service: testService,
        force: true,
        forceBuild: false,
        log: garden.log,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      const result = await garden.processTasks([deployTask], { throwOnError: true })

      expect(result[deployTask.getKey()]!.output.outputs).to.eql({ log: "test output" })
    })
  })
})
