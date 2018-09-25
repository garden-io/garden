import * as Bluebird from "bluebird"
import deline = require("deline")
import { expect } from "chai"
import { flatten, uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../src/garden"
import { makeTestGarden, dataDir } from "../../helpers"
import { getTasksForModule } from "../../../src/tasks/helpers"
import { Task } from "../../../src/tasks/base"

async function sortedBaseKeysWithDependencies(tasks: Task[]): Promise<string[]> {
  return sortedBaseKeys(flatten([tasks].concat(await Bluebird.map(tasks, t => t.getDependencies()))))
}

function sortedBaseKeys(tasks: Task[]): string[] {
  return uniq(tasks.map(t => t.getBaseKey())).sort()
}

describe("TaskHelpers", () => {

  let garden: Garden

  before(async () => {
    garden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getTasksForModule", () => {

    it("returns the correct set of tasks for the changed module", async () => {
      const module = await garden.getModule("good-morning")
      const tasks = await getTasksForModule({
        garden, module, hotReloadServiceNames: [], force: true, forceBuild: true,
        fromWatch: false, includeDependants: false,
      })

      expect(sortedBaseKeys(tasks)).to.eql([
        "build.good-morning",
        "deploy.good-morning",
        "workflow.good-morning-task",
      ])

      expect(await sortedBaseKeysWithDependencies(tasks)).to.eql([
        "build.build-dependency",
        "build.good-morning",
        "deploy.good-morning",
        "push.good-morning",
        "workflow.good-morning-task",
      ].sort())
    })

    describe("returns the correct set of tasks for the changed module and its dependants", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          withoutDependencies: [
            "build.build-dependency",
            "deploy.build-dependency",

            "build.good-morning",
            "deploy.good-morning",
            "workflow.good-morning-task",

            "build.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "workflow.dependant-task",
          ].sort(),
          withDependencies: [
            "build.build-dependency",
            "push.build-dependency",
            "deploy.build-dependency",

            "build.good-morning",
            "push.good-morning",
            "deploy.good-morning",
            "workflow.good-morning-task",

            "build.build-dependant",
            "push.build-dependant",
            "deploy.build-dependant",

            "build.service-dependant",
            "push.service-dependant",
            "deploy.service-dependant",
            "workflow.dependant-task",
          ].sort(),
        },
        {
          moduleName: "good-morning",
          withoutDependencies: [
            "build.good-morning",
            "deploy.good-morning",
            "workflow.good-morning-task",

            "build.build-dependant",
            "deploy.build-dependant",

            "deploy.service-dependant",
            "workflow.dependant-task",
          ].sort(),
          withDependencies: [
            "build.build-dependency",

            "build.good-morning",
            "push.good-morning",
            "deploy.good-morning",
            "workflow.good-morning-task",

            "build.build-dependant",
            "push.build-dependant",
            "deploy.build-dependant",

            "build.service-dependant",
            "push.service-dependant",
            "deploy.service-dependant",
            "workflow.dependant-task",
          ].sort(),
        },
        {
          moduleName: "good-evening",
          withoutDependencies: ["build.good-evening", "deploy.good-evening"],
          withDependencies: ["build.good-evening", "push.good-evening", "deploy.good-evening"].sort(),
        },
        {
          moduleName: "build-dependant",
          withoutDependencies: ["build.build-dependant", "deploy.build-dependant"],
          withDependencies: [
            "build.good-morning",

            "build.build-dependant",
            "push.build-dependant",
            "deploy.build-dependant",
          ].sort(),
        },
        {
          moduleName: "service-dependant",
          withoutDependencies: ["build.service-dependant", "deploy.service-dependant", "workflow.dependant-task"],
          withDependencies: [
            "deploy.good-morning",

            "build.service-dependant",
            "push.service-dependant",
            "deploy.service-dependant",
            "workflow.dependant-task",
          ].sort(),
        },
      ]

      for (const { moduleName, withoutDependencies, withDependencies } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
          const module = await garden.getModule(<string>moduleName)
          const tasks = await getTasksForModule({
            garden, module, hotReloadServiceNames: [], force: true, forceBuild: true,
            fromWatch: true, includeDependants: true,
          })
          expect(sortedBaseKeys(tasks)).to.eql(withoutDependencies)
          expect(await sortedBaseKeysWithDependencies(tasks)).to.eql(withDependencies)
        })

      }

    })

    describe(deline`returns the correct set of tasks for the changed module and its dependants
        (with hot reloading)`, () => {
        const expectedBaseKeysByChangedModule = [
          {
            moduleName: "build-dependency",
            withoutDependencies: ["build.build-dependency", "deploy.build-dependency"],
            withDependencies: ["build.build-dependency", "push.build-dependency", "deploy.build-dependency"].sort(),
          },
          {
            moduleName: "good-morning",
            withoutDependencies: ["deploy.service-dependant", "workflow.dependant-task"],
            withDependencies: [
              "build.service-dependant",
              "push.service-dependant",
              "deploy.service-dependant",
              "workflow.dependant-task",
            ].sort(),
          },
          {
            moduleName: "good-evening",
            withoutDependencies: ["build.good-evening", "deploy.good-evening"],
            withDependencies: ["build.good-evening", "push.good-evening", "deploy.good-evening"].sort(),
          },
          {
            moduleName: "build-dependant",
            withoutDependencies: ["build.build-dependant", "deploy.build-dependant"],
            withDependencies: [
              "build.build-dependant",
              "push.build-dependant",
              "deploy.build-dependant",
            ].sort(),
          },
          {
            moduleName: "service-dependant",
            withoutDependencies: ["build.service-dependant", "deploy.service-dependant", "workflow.dependant-task"],
            withDependencies: [
              "build.service-dependant",
              "push.service-dependant",
              "deploy.service-dependant",
              "workflow.dependant-task",
            ].sort(),
          },
        ]

        for (const { moduleName, withoutDependencies, withDependencies } of expectedBaseKeysByChangedModule) {
          it(`returns the correct set of tasks for ${moduleName} and its dependants`, async () => {
            const module = await garden.getModule(<string>moduleName)
            const tasks = await getTasksForModule({
              garden, module, hotReloadServiceNames: ["good-morning"], force: true, forceBuild: true,
              fromWatch: true, includeDependants: true,
            })
            expect(sortedBaseKeys(tasks)).to.eql(withoutDependencies)
            expect(await sortedBaseKeysWithDependencies(tasks)).to.eql(withDependencies)
          })

        }

      })

  })

})
