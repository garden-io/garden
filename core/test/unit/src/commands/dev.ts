/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { flattenDeep } from "lodash"
import pEvent from "p-event"
import { expect } from "chai"
import {
  DevCommand,
  DevCommandArgs,
  DevCommandOpts,
  getDevCommandWatchTasks,
  getDevCommandInitialTasks,
} from "../../../../src/commands/dev"
import { makeTestGardenA, withDefaultGlobalOpts, TestGarden } from "../../../helpers"
import { GlobalOptions, ParameterValues } from "../../../../src/cli/params"
import { BaseTask } from "../../../../src/tasks/base"

describe("DevCommand", () => {
  const command = new DevCommand()

  async function waitForEvent(garden: TestGarden, name: string) {
    return pEvent(<any>garden.events, name, { timeout: 10000 })
  }

  async function completeFirstTasks(
    garden: TestGarden,
    args: ParameterValues<DevCommandArgs>,
    opts: ParameterValues<GlobalOptions & DevCommandOpts>
  ) {
    const log = garden.log

    await command.prepare({ log, footerLog: log, headerLog: log, args, opts })

    const promise = command
      .action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args,
        opts,
      })
      .then(({ errors }) => {
        if (errors) {
          throw errors[0]
        }
      })
      .catch((err) => {
        // tslint:disable-next-line: no-console
        console.error(err)
      })

    await waitForEvent(garden, "watchingForChanges")

    garden.events.emit("_exit", {})

    const completedTasks = garden.events.eventLog
      .filter((e) => e.name === "taskComplete")
      .map((e) => e.payload["key"])
      .filter((key) => !key.startsWith("resolve-module."))
      .sort()

    return { promise, completedTasks }
  }

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should deploy, run and test everything in a project", async () => {
    const garden = await makeTestGardenA()

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-c",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-service-status.service-c",
      "get-task-result.task-c",
      "resolve-provider.container",
      "resolve-provider.exec",
      "resolve-provider.templated",
      "resolve-provider.test-plugin",
      "resolve-provider.test-plugin-b",
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
      "task.task-c",
      "test.module-a.integration",
      "test.module-a.unit",
      "test.module-b.unit",
      "test.module-c.integ",
      "test.module-c.unit",
    ])

    return promise
  })

  it("should initially deploy services with hot reloading when requested", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const graph = await garden.getConfigGraph({ log, emit: false })
    const modules = graph.getModules()

    const initialTasks = await getDevCommandInitialTasks({
      garden,
      log,
      graph,
      modules,
      services: graph.getServices(),
      devModeServiceNames: [],
      // Note: service-a is a runtime dependency of module-a's integration test spec, so in this test case
      // we're implicitly verifying that tests with runtime dependencies on services being deployed with
      // hot reloading don't request non-hot-reload-enabled deploys for those same services.
      hotReloadServiceNames: ["service-a"],
      localModeServiceNames: [],
      skipTests: false,
      forceDeploy: false,
    })

    const withDeps = async (task: BaseTask) => {
      const deps = await task.resolveDependencies()
      return [task, await Bluebird.map(deps, async (dep) => await withDeps(dep))]
    }

    const initialTasksWithDeps: BaseTask[] = flattenDeep(await Bluebird.map(initialTasks, withDeps))
    const deployTasksForServiceA = initialTasksWithDeps.filter((t) => t.getKey() === "deploy.service-a")

    expect(deployTasksForServiceA.length).to.be.greaterThan(0)
    for (const deployTask of deployTasksForServiceA) {
      expect(deployTask!["hotReloadServiceNames"]).to.eql(["service-a"])
    }
  })

  it("should skip disabled services", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.services[0].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("deploy.service-c")

    return promise
  })

  it("should skip disabled tasks", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].spec.tasks[0].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("task.task-c")

    return promise
  })

  it("should skip disabled tests", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-b"].spec.tests[0].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("test.module-b.unit")

    return promise
  })

  it("should skip services from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("deploy.service-c")

    return promise
  })

  it("should skip tasks from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("task.task-c")

    return promise
  })

  it("should skip tests from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = { services: undefined }
    const opts = withDefaultGlobalOpts({
      "force-build": false,
      "force": false,
      "hot-reload": undefined,
      "local-mode": undefined,
      "skip-tests": false,
      "test-names": undefined,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("test.module-c.unit")
    expect(completedTasks).to.not.include("test.module-c.integ")

    return promise
  })
})

describe("getDevCommandWatchTasks", () => {
  it("should deploy, run and test appropriately on watch change", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const graph = await garden.getConfigGraph({ log, emit: false })

    const watchTasks = await getDevCommandWatchTasks({
      garden,
      log,
      updatedGraph: graph,
      module: graph.getModule("module-b"),
      servicesWatched: graph.getServices().map((s) => s.name),
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
      testNames: undefined,
      skipTests: false,
    })

    const results = await garden.processTasks(watchTasks)
    expect(Object.keys(results).sort()).to.eql([
      "build.module-a",
      "build.module-b",
      "build.module-c",
      "deploy.service-a",
      "deploy.service-b",
      "deploy.service-c",
      "get-service-status.service-a",
      "get-service-status.service-b",
      "get-service-status.service-c",
      "get-task-result.task-c",
      "stage-build.module-a",
      "stage-build.module-b",
      "stage-build.module-c",
      "task.task-c",
      "test.module-b.unit",
      "test.module-c.integ",
      "test.module-c.unit",
    ])
  })
})
