import pEvent from "p-event"
import { expect } from "chai"
import { DevCommand, DevCommandArgs, DevCommandOpts } from "../../../../src/commands/dev"
import { makeTestGardenA, withDefaultGlobalOpts, TestGarden } from "../../../helpers"
import { ParameterValues } from "../../../../src/commands/base"
import { GlobalOptions } from "../../../../src/cli/cli"

describe("DevCommand", () => {
  const command = new DevCommand()

  async function waitForEvent(garden: TestGarden, name: string) {
    return pEvent(<any>garden.events, name, { timeout: 5000 })
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
      .sort()

    return { promise, completedTasks }
  }

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should deploy, run and test everything in a project", async () => {
    const garden = await makeTestGardenA()

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
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

  it("should skip disabled services", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].spec.services[0].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("deploy.service-c")

    return promise
  })

  it("should skip disabled tasks", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].spec.tasks[0].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("task.task-c")

    return promise
  })

  it("should skip disabled tests", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-b"].spec.tests[0].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("test.module-b.unit")

    return promise
  })

  it("should skip services from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("deploy.service-c")

    return promise
  })

  it("should skip tasks from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("task.task-c")

    return promise
  })

  it("should skip tests from disabled modules", async () => {
    const garden = await makeTestGardenA()

    await garden.scanModules()
    garden["moduleConfigs"]["module-c"].disabled = true

    const args = {}
    const opts = withDefaultGlobalOpts({
      "force-build": false,
    })

    const { promise, completedTasks } = await completeFirstTasks(garden, args, opts)

    expect(completedTasks).to.not.include("test.module-c.unit")
    expect(completedTasks).to.not.include("test.module-c.integ")

    return promise
  })
})
