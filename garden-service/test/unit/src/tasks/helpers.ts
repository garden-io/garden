import * as Bluebird from "bluebird"
import { expect } from "chai"
import { flatten, uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../../src/garden"
import { makeTestGarden, dataDir } from "../../../helpers"
import { getDependantTasksForModule } from "../../../../src/tasks/helpers"
import { BaseTask } from "../../../../src/tasks/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../src/config-graph"

async function sortedBaseKeysdependencyTasks(tasks: BaseTask[]): Promise<string[]> {
  const dependencies = await Bluebird.map(tasks, async (t) => t.getDependencies(), { concurrency: 1 })
  const tasksdependencyTasks = flatten([tasks].concat(dependencies))
  return sortedBaseKeys(tasksdependencyTasks)
}

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map(t => t.getKey())).sort()
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
        garden, graph, log, module, hotReloadServiceNames: [], force: true, forceBuild: true,
        fromWatch: false, includeDependants: false,
      })

      expect(sortedBaseKeys(tasks)).to.eql([
        "deploy.good-morning",
        "push.good-morning",
      ])

      expect(await sortedBaseKeysdependencyTasks(tasks)).to.eql([
        "build.good-morning",
        "deploy.good-morning",
        "push.good-morning",
        "task.good-morning-task",
      ].sort())
    })

    context("without hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expected: [
            "push.build-dependency",
            "deploy.build-dependency",

            "push.good-morning",
            "deploy.good-morning",

            "push.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
          dependencyTasks: [
            "build.build-dependant",
            "build.build-dependency",
            "build.good-morning",

            "push.service-dependant",
            "push.service-dependant2",

            "task.good-morning-task",
          ],
        },
        {
          moduleName: "good-morning",
          expected: [
            "push.good-morning",
            "deploy.good-morning",

            "push.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
          dependencyTasks: [
            "build.build-dependant",
            "build.good-morning",

            "push.service-dependant",
            "push.service-dependant2",

            "task.good-morning-task",
          ],
        },
        {
          moduleName: "good-evening",
          expected: [
            "deploy.good-evening",
            "push.good-evening",
          ],
          dependencyTasks: [
            "build.good-evening",
          ],
        },
        {
          moduleName: "build-dependant",
          expected: [
            "deploy.build-dependant",
            "push.build-dependant",
          ],
          dependencyTasks: [
            "build.build-dependant",
          ],
        },
        {
          moduleName: "service-dependant",
          expected: [
            "deploy.service-dependant",
            "push.service-dependant",
          ],
          dependencyTasks: [
            "build.service-dependant",
            "deploy.good-morning",
          ],
        },
      ]

      for (const { moduleName, expected, dependencyTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden, graph, log, module, hotReloadServiceNames: [], force: true, forceBuild: true,
            fromWatch: true, includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(expected.sort())
          expect(await sortedBaseKeysdependencyTasks(tasks)).to.eql(expected.concat(dependencyTasks).sort())
        })

      }

    })

    context("with hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expected: [
            "push.build-dependency",
            "deploy.build-dependency",
          ],
          dependencyTasks: [
            "build.build-dependency",
          ],
        },
        {
          moduleName: "good-morning",
          expected: [
            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
          dependencyTasks: [
            "push.service-dependant",
            "push.service-dependant2",
          ],
        },
        {
          moduleName: "good-evening",
          expected: [
            "deploy.good-evening",
            "push.good-evening",
          ],
          dependencyTasks: [
            "build.good-evening",
          ],
        },
        {
          moduleName: "build-dependant",
          expected: [
            "deploy.build-dependant",
            "push.build-dependant",
          ],
          dependencyTasks: [
            "build.build-dependant",
          ],
        },
        {
          moduleName: "service-dependant",
          expected: [
            "deploy.service-dependant",
            "push.service-dependant",
          ],
          dependencyTasks: [
            "build.service-dependant",
          ],
        },
      ]

      for (const { moduleName, expected, dependencyTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
          const module = await graph.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden, graph, log, module, hotReloadServiceNames: ["good-morning"], force: true, forceBuild: true,
            fromWatch: true, includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(expected.sort())
          expect(await sortedBaseKeysdependencyTasks(tasks)).to.eql(expected.concat(dependencyTasks).sort())
        })

      }

    })

  })

})
