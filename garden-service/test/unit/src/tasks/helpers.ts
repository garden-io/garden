import Bluebird from "bluebird"
import { expect } from "chai"
import { flatten, uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../../src/garden"
import { makeTestGarden, dataDir } from "../../../helpers"
import { getDependantTasksForModule } from "../../../../src/tasks/helpers"
import { BaseTask } from "../../../../src/tasks/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"

async function dependencyBaseKeys(tasks: BaseTask[]): Promise<string[]> {
  const dependencies = await Bluebird.map(tasks, async (t) => t.getDependencies(), { concurrency: 1 })
  const tasksdependencyTasks = flatten(dependencies)
  return sortedBaseKeys(tasksdependencyTasks)
}

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map((t) => t.getKey())).sort()
}

describe("TaskHelpers", () => {
  let garden: Garden
  let graph: ConfigGraph
  let log: LogEntry

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
    graph = await garden.getConfigGraph()
    log = garden.log
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getDependantTasksForModule", () => {
    it("returns the correct set of tasks for the changed module", async () => {
      const module = await graph.getModule("good-morning")
      await garden.getConfigGraph()

      const tasks = await getDependantTasksForModule({
        garden,
        graph,
        log,
        module,
        hotReloadServiceNames: [],
        force: true,
        forceBuild: true,
        fromWatch: false,
        includeDependants: false,
      })

      expect(sortedBaseKeys(tasks)).to.eql(["build.good-morning", "deploy.good-morning"])

      expect(await dependencyBaseKeys(tasks)).to.eql(
        [
          "build.build-dependency",
          "build.good-morning",
          "get-service-status.good-morning",
          "task.good-morning-task",
        ].sort()
      )
    })

    context("without hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          taskKeys: ["build.build-dependency", "deploy.build-dependency"],
          withDependants: [
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
          taskKeys: ["build.good-morning", "deploy.good-morning"],
          withDependants: [
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
          taskKeys: ["build.good-evening", "deploy.good-evening"],
          withDependants: ["build.good-evening", "deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          taskKeys: ["build.build-dependant", "deploy.build-dependant"],
          withDependants: ["build.build-dependant", "deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          taskKeys: ["build.service-dependant", "deploy.service-dependant"],
          withDependants: ["build.service-dependant", "deploy.service-dependant"],
        },
      ]

      for (const { moduleName, taskKeys, withDependants } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName}`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden,
            graph,
            log,
            module,
            hotReloadServiceNames: [],
            force: true,
            forceBuild: true,
            fromWatch: true,
            includeDependants: false,
          })
          expect(sortedBaseKeys(tasks)).to.eql(taskKeys.sort())
        })

        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden,
            graph,
            log,
            module,
            hotReloadServiceNames: [],
            force: true,
            forceBuild: true,
            fromWatch: true,
            includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(withDependants.sort())
        })
      }
    })

    context("with hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          taskKeys: ["build.build-dependency", "deploy.build-dependency"],
          withDependants: ["build.build-dependency", "deploy.build-dependency"],
        },
        {
          moduleName: "good-morning",
          taskKeys: ["build.good-morning", "deploy.good-morning"],
          withDependants: ["deploy.service-dependant", "deploy.service-dependant2"],
        },
        {
          moduleName: "good-evening",
          taskKeys: ["build.good-evening", "deploy.good-evening"],
          withDependants: ["build.good-evening", "deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          taskKeys: ["build.build-dependant", "deploy.build-dependant"],
          withDependants: ["build.build-dependant", "deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          taskKeys: ["build.service-dependant", "deploy.service-dependant"],
          withDependants: ["build.service-dependant", "deploy.service-dependant"],
        },
      ]

      for (const { moduleName, taskKeys, withDependants } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName}`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden,
            graph,
            log,
            module,
            hotReloadServiceNames: ["good-morning"],
            force: true,
            forceBuild: true,
            fromWatch: true,
            includeDependants: false,
          })
          expect(sortedBaseKeys(tasks)).to.eql(taskKeys.sort())
        })

        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden,
            graph,
            log,
            module,
            hotReloadServiceNames: ["good-morning"],
            force: true,
            forceBuild: true,
            fromWatch: true,
            includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(withDependants.sort())
        })
      }
    })
  })
})
