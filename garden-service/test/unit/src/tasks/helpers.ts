import { expect } from "chai"
import { uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../../src/garden"
import { makeTestGarden, dataDir } from "../../../helpers"
import { getModuleWatchTasks } from "../../../../src/tasks/helpers"
import { BaseTask } from "../../../../src/tasks/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map((t) => t.getKey())).sort()
}

describe("TaskHelpers", () => {
  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
    graph = await garden.getConfigGraph(garden.log)
    log = garden.log
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getModuleWatchTasks", () => {
    context("without hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expectedTasks: [
            "build.build-dependant",
            "build.build-dependency",
            "build.good-morning",
            "deploy.build-dependant",
            "deploy.build-dependency",
            "deploy.good-morning",
            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
        },
        {
          moduleName: "good-morning",
          expectedTasks: [
            "build.build-dependant",
            "build.good-morning",
            "deploy.build-dependant",
            "deploy.good-morning",
            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
        },
        {
          moduleName: "good-evening",
          expectedTasks: ["build.good-evening", "deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          expectedTasks: ["build.build-dependant", "deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          expectedTasks: ["build.service-dependant", "deploy.service-dependant"],
        },
      ]

      for (const { moduleName, expectedTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getModuleWatchTasks({
            garden,
            graph,
            log,
            module,
            serviceNames: module.serviceNames,
            hotReloadServiceNames: [],
          })
          expect(sortedBaseKeys(tasks)).to.eql(expectedTasks.sort())
        })
      }
    })

    context("with hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expectedTasks: ["build.build-dependency", "deploy.build-dependency"],
        },
        {
          moduleName: "good-morning",
          expectedTasks: ["deploy.service-dependant", "deploy.service-dependant2", "hot-reload.good-morning"],
        },
        {
          moduleName: "good-evening",
          expectedTasks: ["build.good-evening", "deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          expectedTasks: ["build.build-dependant", "deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          expectedTasks: ["build.service-dependant", "deploy.service-dependant"],
        },
      ]

      for (const { moduleName, expectedTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getModuleWatchTasks({
            garden,
            graph,
            log,
            module,
            serviceNames: module.serviceNames,
            hotReloadServiceNames: ["good-morning"],
          })
          expect(sortedBaseKeys(tasks)).to.eql(expectedTasks.sort())
        })
      }
    })
  })
})
