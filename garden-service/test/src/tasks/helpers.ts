import * as Bluebird from "bluebird"
import { expect } from "chai"
import { flatten, uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../src/garden"
import { makeTestGarden, dataDir } from "../../helpers"
import { getDependantTasksForModule } from "../../../src/tasks/helpers"
import { BaseTask } from "../../../src/tasks/base"
import { LogEntry } from "../../../src/logger/log-entry"

async function sortedBaseKeysdependencyTasks(tasks: BaseTask[]): Promise<string[]> {
  const dependencies = await Bluebird.map(tasks, async (t) => t.getDependencies(), { concurrency: 1 })
  const tasksdependencyTasks = flatten([tasks].concat(dependencies))
  return sortedBaseKeys(tasksdependencyTasks)
}

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map(t => t.getBaseKey())).sort()
}

describe("TaskHelpers", () => {
  let garden: Garden
  let log: LogEntry

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
    log = garden.log
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getDependantTasksForModule", () => {

    it("returns the correct set of tasks for the changed module", async () => {
      const module = await garden.getModule("good-morning")
      await garden.getDependencyGraph()

      const tasks = await getDependantTasksForModule({
        garden, log, module, hotReloadServiceNames: [], force: true, forceBuild: true,
        fromWatch: false, includeDependants: false,
      })

      expect(sortedBaseKeys(tasks)).to.eql([
        "build.good-morning",
        "deploy.good-morning",
      ])

      expect(await sortedBaseKeysdependencyTasks(tasks)).to.eql([
        "build.build-dependency",
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
            "build.build-dependency",
            "deploy.build-dependency",

            "build.good-morning",
            "deploy.good-morning",

            "build.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
          dependencyTasks: [
            "push.build-dependency",
            "push.good-morning",
            "push.build-dependant",
            "push.service-dependant",
            "push.service-dependant2",

            "task.good-morning-task",
          ],
        },
        {
          moduleName: "good-morning",
          expected: [
            "build.good-morning",
            "deploy.good-morning",

            "build.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
          dependencyTasks: [
            "build.build-dependency",

            "push.good-morning",
            "push.build-dependant",
            "push.service-dependant",
            "push.service-dependant2",

            "task.good-morning-task",
          ],
        },
        {
          moduleName: "good-evening",
          expected: [
            "build.good-evening",
            "deploy.good-evening",
          ],
          dependencyTasks: [
            "push.good-evening",
          ],
        },
        {
          moduleName: "build-dependant",
          expected: [
            "build.build-dependant",
            "deploy.build-dependant",
          ],
          dependencyTasks: [
            "build.good-morning",
            "push.build-dependant",
          ],
        },
        {
          moduleName: "service-dependant",
          expected: [
            "build.service-dependant",
            "deploy.service-dependant",
          ],
          dependencyTasks: [
            "deploy.good-morning",
            "push.service-dependant",
          ],
        },
      ]

      for (const { moduleName, expected, dependencyTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
          const module = await garden.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden, log, module, hotReloadServiceNames: [], force: true, forceBuild: true,
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
            "build.build-dependency",
            "deploy.build-dependency",
          ],
          dependencyTasks: [
            "push.build-dependency",
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
            "build.good-evening",
            "deploy.good-evening",
          ],
          dependencyTasks: [
            "push.good-evening",
          ],
        },
        {
          moduleName: "build-dependant",
          expected: [
            "build.build-dependant",
            "deploy.build-dependant",
          ],
          dependencyTasks: [
            "build.good-morning",
            "push.build-dependant",
          ],
        },
        {
          moduleName: "service-dependant",
          expected: [
            "build.service-dependant",
            "deploy.service-dependant",
          ],
          dependencyTasks: [
            "push.service-dependant",
          ],
        },
      ]

      for (const { moduleName, expected, dependencyTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
          const module = await garden.getModule(<string>moduleName)
          const tasks = await getDependantTasksForModule({
            garden, log, module, hotReloadServiceNames: ["good-morning"], force: true, forceBuild: true,
            fromWatch: true, includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(expected.sort())
          expect(await sortedBaseKeysdependencyTasks(tasks)).to.eql(expected.concat(dependencyTasks).sort())
        })

      }

    })

  })

})
