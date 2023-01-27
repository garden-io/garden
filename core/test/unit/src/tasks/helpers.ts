/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { uniq } from "lodash"
import { Garden } from "../../../../src/garden"
import { makeTestGarden, makeTestGardenA, getDataDir } from "../../../helpers"
import { getActionWatchTasks } from "../../../../src/tasks/helpers"
import { BaseTask } from "../../../../src/tasks/base"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DEFAULT_API_VERSION } from "../../../../src/constants"

function sortedBaseKeys(tasks: BaseTask[]): string[] {
  return uniq(tasks.map((t) => t.getBaseKey())).sort()
}

describe("TaskHelpers", () => {
  let depGarden: Garden
  let log: LogEntry

  before(async () => {
    depGarden = await makeTestGarden(getDataDir("test-project-dependants"))
    log = depGarden.log
  })

  /**
   * Note: Since we also test with dependencies included in the task lists generated , these tests also check the
   * getDependencies methods of the task classes in question.
   */
  describe("getActionWatchTasks", () => {
    it("should return tasks for an action", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs(
        [],
        [
          {
            name: "test-action",
            kind: "Deploy",
            type: "test",
            internal: {
              basePath: "foo",
            },
            spec: {},
          },
        ]
      )
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("test-action")

      const tasks = await getActionWatchTasks({
        garden,
        graph,
        log,
        updatedAction: action,
        deploysWatched: graph.getDeploys().map((s) => s.name),
        devModeDeployNames: [],
        localModeDeployNames: [],
        testsWatched: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["deploy.test-action"])
    })

    it("should return no tasks for a disabled action, but include its dependants", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs(
        [],
        [
          {
            name: "disabled-action",
            internal: {
              basePath: "foo",
            },
            kind: "Deploy",
            spec: {},
            type: "test",
            disabled: true,
          },
          {
            name: "not-disabled-dependant",
            internal: {
              basePath: "foo",
            },
            dependencies: ["deploy.disabled-action"],
            kind: "Deploy",
            spec: {},
            type: "test",
          },
        ]
      )

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("disabled-action", { includeDisabled: true })

      const tasks = await getActionWatchTasks({
        garden,
        graph,
        log,
        updatedAction: action,
        deploysWatched: graph.getDeploys().map((s) => s.name),
        devModeDeployNames: [],
        localModeDeployNames: [],
        testsWatched: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["deploy.not-disabled-dependant"])
    })

    it("should omit tasks for disabled dependant actions", async () => {
      const garden = await makeTestGardenA()

      garden.setActionConfigs(
        [],
        [
          {
            name: "disabled-dependant-action",
            internal: {
              basePath: "foo",
            },
            kind: "Deploy",
            spec: {},
            type: "test",
            disabled: true,
            dependencies: ["deploy.not-disabled-dependency-action"],
          },
          {
            name: "not-disabled-dependency-action",
            internal: {
              basePath: "foo",
            },
            kind: "Deploy",
            spec: {},
            type: "test",
          },
        ]
      )

      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("not-disabled-dependency-action")

      const tasks = await getActionWatchTasks({
        garden,
        graph,
        log,
        updatedAction: action,
        deploysWatched: graph.getDeploys().map((s) => s.name),
        devModeDeployNames: [],
        localModeDeployNames: [],
        testsWatched: [],
      })

      expect(sortedBaseKeys(tasks)).to.eql(["deploy.not-disabled-dependency-action"])
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
          const action = graph.getBuild(<string>moduleName)

          const tasks = await getActionWatchTasks({
            garden: depGarden,
            graph,
            log,
            updatedAction: action,
            deploysWatched: graph.getDeploys().map((s) => s.name),
            devModeDeployNames: [],
            localModeDeployNames: [],
            testsWatched: [],
          })
          expect(sortedBaseKeys(tasks)).to.eql(expectedTasks.sort())
        })
      }

      it("should omit deploy tasks for disabled services in the module", async () => {
        const garden = await makeTestGardenA()

        garden.setActionConfigs([
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
        const action = graph.getDeploy("service-a", { includeDisabled: true })

        const tasks = await getActionWatchTasks({
          garden,
          graph,
          log,
          updatedAction: action,
          deploysWatched: graph.getDeploys().map((s) => s.name),
          devModeDeployNames: [],
          localModeDeployNames: [],
          testsWatched: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql([])
      })

      it("should omit deploy tasks for disabled dependant services", async () => {
        const garden = await makeTestGardenA()

        garden.setActionConfigs([
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
        const action = graph.getDeploy("service-a", { includeDisabled: true })

        const tasks = await getActionWatchTasks({
          garden,
          graph,
          log,
          updatedAction: action,
          deploysWatched: graph.getDeploys().map((s) => s.name),
          devModeDeployNames: [],
          localModeDeployNames: [],
          testsWatched: [],
        })

        expect(sortedBaseKeys(tasks)).to.eql(["deploy.service-a"])
      })
    })
  })
})
