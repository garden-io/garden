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
import { ConfigGraph } from "../../../../src/graph/config-graph"
// import { GardenPlugin } from "../../../../src/plugin/plugin"
import { DeployTask } from "../../../../src/tasks/deploy"
import { expect } from "chai"
import { customizedTestPlugin, TestGarden } from "../../../helpers"
import { defaultDotIgnoreFile } from "../../../../src/util/fs"

describe("DeployTask", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let graph: ConfigGraph
  let config: ProjectConfig
  // let testPlugin: GardenPlugin

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

    // testPlugin = createGardenPlugin({
    //   name: "test",
    //   createModuleTypes: [
    //     {
    //       name: "test",
    //       docs: "test",
    //       serviceOutputsSchema: joi.object().keys({ log: joi.string() }),
    //       handlers: {
    //         build: async () => ({}),
    //         getServiceStatus: async () => {
    //           return {
    //             state: <ServiceState>"missing",
    //             detail: {},
    //             outputs: {},
    //           }
    //         },
    //         deployService: async ({ service }: DeployServiceParams) => {
    //           return {
    //             state: <ServiceState>"ready",
    //             detail: {},
    //             outputs: { log: service.spec.log },
    //           }
    //         },
    //         runTask: async ({ task }: RunTaskParams) => {
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
    garden = await TestGarden.factory(tmpDir.path, { config, plugins: [testPlugin] })

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
            dependencies: ["dep-service", "test-task"],
            disabled: false,

            spec: {
              log: "${runtime.tasks.test-task.outputs.log}",
            },
          },
          {
            name: "dep-service",
            dependencies: [],
            disabled: false,

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
    ])

    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  describe("resolveProcessDependencies", () => {
    it("should always return deploy action's dependencies having force = false", async () => {
      const action = graph.getDeploy("test-service")

      const forcedDeployTask = new DeployTask({
        garden,
        graph,
        action,
        force: true,
        forceBuild: false,
        fromWatch: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      expect(forcedDeployTask.resolveProcessDependencies().find((dep) => dep.type === "task")!.force).to.be.false

      const unforcedDeployTask = new DeployTask({
        garden,
        graph,
        action,
        force: false,
        forceBuild: false,
        fromWatch: false,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      expect(unforcedDeployTask.resolveProcessDependencies().find((dep) => dep.type === "task")!.force).to.be.false

      const deployTaskFromWatch = new DeployTask({
        garden,
        graph,
        action,
        force: false,
        forceBuild: false,
        fromWatch: true,
        log: garden.log,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      expect(deployTaskFromWatch.resolveProcessDependencies().find((dep) => dep.type === "task")!.force).to.be.false
    })

    context("when skipRuntimeDependencies = true", () => {
      it("doesn't return deploy or run dependencies", async () => {
        const action = graph.getDeploy("test-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          action,
          force: true,
          forceBuild: false,
          fromWatch: false,
          log: garden.log,
          skipRuntimeDependencies: true, // <-----
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        const deps = deployTask.resolveProcessDependencies()
        expect(deps.find((dep) => dep.type === "deploy" || dep.type === "run")).to.be.undefined
      })
    })
  })

  describe("process", () => {
    it("should correctly resolve runtime outputs from deploys", async () => {
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

      expect(result[deployTask.getBaseKey()]!.result.outputs).to.eql({ log: "test output" })
    })
  })
})
