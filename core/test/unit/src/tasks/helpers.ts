/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { uniq } from "lodash"
import { resolve } from "path"
import { Garden } from "../../../../src/garden"
import { makeTestGarden, dataDir, makeTestGardenA } from "../../../helpers"
import { getModuleWatchTasks } from "../../../../src/tasks/helpers"
import { BaseTask } from "../../../../src/tasks/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DEFAULT_API_VERSION } from "../../../../src/constants"

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map((t) => t.getKey())).sort()
}

describe("TaskHelpers", () => {
  let depGarden: Garden
  let log: LogEntry

  before(async () => {
    depGarden = await makeTestGarden(resolve(dataDir, "test-project-dependants"))
    log = depGarden.log
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getModuleWatchTasks", () => {
    it("should return no deploy tasks for a disabled module, but include its dependant tasks", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: true, // <---------------
          name: "module-a",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: false,
          name: "module-b",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("module-a", true)

      const tasks = await getModuleWatchTasks({
        garden,
        graph,
        log,
        module,
        servicesWatched: graph.getServices().map((s) => s.name),
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["deploy.service-b"])
    })

    it("should omit tasks for disabled dependant modules", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-a",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: true, // <---------------
          name: "module-b",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = graph.getModule("module-a", true)

      const tasks = await getModuleWatchTasks({
        garden,
        graph,
        log,
        module,
        servicesWatched: graph.getServices().map((s) => s.name),
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["deploy.service-a"])
    })

    it("should not add a build task for a hot-reload-enabled service's sourceModule", async () => {
      const garden = await makeTestGardenA()

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          name: "module-a",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: { services: [] },
          testConfigs: [],
          type: "test",
        },
        {
          apiVersion: DEFAULT_API_VERSION,
          allowPublish: false,
          build: { dependencies: [{ name: "module-a", copy: [] }] },
          disabled: false,
          name: "module-b",
          include: [],
          path: garden.projectRoot,
          serviceConfigs: [],
          taskConfigs: [],
          spec: {
            services: [
              {
                name: "service-b",
                dependencies: [],
                disabled: false,
                sourceModule: "module-a", // <---------------
              },
            ],
          },
          testConfigs: [],
          type: "test",
        },
      ])

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const module = await graph.getModule("module-b", true)

      const tasks = await getModuleWatchTasks({
        garden,
        graph,
        log,
        module,
        servicesWatched: graph.getServices().map((s) => s.name),
        devModeServiceNames: [],
        hotReloadServiceNames: ["service-b"],
        localModeServiceNames: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["hot-reload.service-b"])
    })

    context("without hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expectedTasks: [
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
            "deploy.build-dependant",
            "deploy.good-morning",
            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
        },
        {
          moduleName: "good-evening",
          expectedTasks: ["deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          expectedTasks: ["deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          expectedTasks: ["deploy.service-dependant"],
        },
      ]

      for (const { moduleName, expectedTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const graph = await depGarden.getConfigGraph({ log: depGarden.log, emit: false })
          const module = graph.getModule(<string>moduleName)

          const tasks = await getModuleWatchTasks({
            garden: depGarden,
            graph,
            log,
            module,
            servicesWatched: graph.getServices().map((s) => s.name),
            devModeServiceNames: [],
            hotReloadServiceNames: [],
            localModeServiceNames: [],
          })
          expect(sortedBaseKeys(tasks)).to.eql(expectedTasks.sort())
        })
      }

      it("should omit deploy tasks for disabled services in the module", async () => {
        const garden = await makeTestGardenA()

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            name: "module-a",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-a",
                  dependencies: [],
                  disabled: true, // <---------------
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
        ])

        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const module = graph.getModule("module-a", true)

        const tasks = await getModuleWatchTasks({
          garden,
          graph,
          log,
          module,
          servicesWatched: graph.getServices().map((s) => s.name),
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql([])
      })

      it("should omit deploy tasks for disabled dependant services", async () => {
        const garden = await makeTestGardenA()

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            name: "module-a",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-a",
                  dependencies: [],
                  disabled: false,
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [{ name: "module-a", copy: [] }] },
            disabled: false,
            name: "module-b",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-b",
                  dependencies: [],
                  disabled: true, // <---------------
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
        ])

        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const module = graph.getModule("module-a", true)

        const tasks = await getModuleWatchTasks({
          garden,
          graph,
          log,
          module,
          servicesWatched: graph.getServices().map((s) => s.name),
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql(["deploy.service-a"])
      })
    })

    context("with hot reloading enabled", () => {
      const expectedBaseKeysByChangedModule = [
        {
          moduleName: "build-dependency",
          expectedTasks: [
            "deploy.build-dependant",
            "deploy.build-dependency",
            "deploy.service-dependant",
            "deploy.service-dependant2",
          ],
        },
        {
          moduleName: "good-morning",
          expectedTasks: [
            "deploy.build-dependant",
            "deploy.service-dependant",
            "deploy.service-dependant2",
            "hot-reload.good-morning",
          ],
        },
        {
          moduleName: "good-evening",
          expectedTasks: ["deploy.good-evening"],
        },
        {
          moduleName: "build-dependant",
          expectedTasks: ["deploy.build-dependant"],
        },
        {
          moduleName: "service-dependant",
          expectedTasks: ["deploy.service-dependant"],
        },
      ]

      for (const { moduleName, expectedTasks } of expectedBaseKeysByChangedModule) {
        it(`returns the correct set of tasks for ${moduleName} with dependants`, async () => {
          const graph = await depGarden.getConfigGraph({ log: depGarden.log, emit: false })
          const module = graph.getModule(<string>moduleName)

          const tasks = await getModuleWatchTasks({
            garden: depGarden,
            graph,
            log,
            module,
            servicesWatched: graph.getServices().map((s) => s.name),
            devModeServiceNames: [],
            hotReloadServiceNames: ["good-morning"],
            localModeServiceNames: [],
          })
          expect(sortedBaseKeys(tasks)).to.eql(expectedTasks.sort())
        })
      }

      it("should omit hot reload tasks for disabled services in the module", async () => {
        const garden = await makeTestGardenA()

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            name: "module-a",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-a",
                  dependencies: [],
                  disabled: true, // <---------------
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
        ])

        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const module = graph.getModule("module-a", true)

        const tasks = await getModuleWatchTasks({
          garden,
          graph,
          log,
          module,
          servicesWatched: ["service-a"],
          devModeServiceNames: [],
          hotReloadServiceNames: ["service-a"],
          localModeServiceNames: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql([])
      })

      it("should omit hot reload tasks for disabled dependant services", async () => {
        const garden = await makeTestGardenA()

        garden.setModuleConfigs([
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [] },
            disabled: false,
            name: "module-a",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-a",
                  dependencies: [],
                  disabled: false,
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
          {
            apiVersion: DEFAULT_API_VERSION,
            allowPublish: false,
            build: { dependencies: [{ name: "module-a", copy: [] }] },
            disabled: false,
            name: "module-b",
            include: [],
            path: garden.projectRoot,
            serviceConfigs: [],
            taskConfigs: [],
            spec: {
              services: [
                {
                  name: "service-b",
                  dependencies: [],
                  disabled: true, // <---------------
                },
              ],
            },
            testConfigs: [],
            type: "test",
          },
        ])

        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const module = graph.getModule("module-a", true)

        const tasks = await getModuleWatchTasks({
          garden,
          graph,
          log,
          module,
          servicesWatched: ["service-a", "service-b"],
          devModeServiceNames: [],
          hotReloadServiceNames: ["service-a", "service-b"],
          localModeServiceNames: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql(["hot-reload.service-a"])
      })
    })
  })
})
