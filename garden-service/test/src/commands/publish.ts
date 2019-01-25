import chalk from "chalk"
import { it } from "mocha"
import { join } from "path"
import { expect } from "chai"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { PluginFactory } from "../../../src/types/plugin/plugin"
import { PublishCommand } from "../../../src/commands/publish"
import { makeTestGardenA, configureTestModule } from "../../helpers"
import { expectError, taskResultOutputs } from "../../helpers"
import { ModuleVersion } from "../../../src/vcs/base"
import { LogEntry } from "../../../src/logger/log-entry"

const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

const getBuildStatus = async () => {
  return { ready: true }
}

const build = async () => {
  return { fresh: true }
}

const publishModule = async () => {
  return { published: true }
}

const testProvider: PluginFactory = () => {
  return {
    moduleActions: {
      test: {
        configure: configureTestModule,
        getBuildStatus,
        build,
        publishModule,
      },
    },
  }
}

async function getTestGarden() {
  const plugins = { "test-plugin": testProvider }
  const garden = await Garden.factory(projectRootB, { plugins })
  await garden.clearBuilds()
  return garden
}

describe("PublishCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.

  it("should build and publish modules in a project", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      args: {
        modules: undefined,
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "build.module-b": { fresh: false },
      "publish.module-a": { published: true },
      "publish.module-b": { published: true },
      "publish.module-c": { published: false },
    })
  })

  it("should optionally force new build", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      args: {
        modules: undefined,
      },
      opts: {
        "allow-dirty": false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true },
      "build.module-b": { fresh: true },
      "publish.module-a": { published: true },
      "publish.module-b": { published: true },
      "publish.module-c": { published: false },
    })
  })

  it("should optionally build selected module", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      args: {
        modules: ["module-a"],
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "publish.module-a": { published: true },
    })
  })

  it("should respect allowPublish flag", async () => {
    const garden = await getTestGarden()
    const log = garden.log
    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      args: {
        modules: ["module-c"],
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "publish.module-c": { published: false },
    })
  })

  it("should fail gracefully if module does not have a provider for publish", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    await garden.clearBuilds()

    const command = new PublishCommand()

    const { result } = await command.action({
      garden,
      log,
      args: {
        modules: ["module-a"],
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": {
        buildLog: "A",
        fresh: true,
      },
      "publish.module-a": {
        published: false,
        message: chalk.yellow("No publish handler available for module type test"),
      },
    })
  })

  context("module is dirty", () => {
    let garden
    let log: LogEntry

    beforeEach(async () => {
      td.replace(Garden.prototype, "resolveVersion", async (): Promise<ModuleVersion> => {
        return {
          versionString: "012345",
          dirtyTimestamp: 12345,
          dependencyVersions: {},
        }
      })
      garden = await getTestGarden()
      log = garden.log
    })

    it("should throw if module is dirty", async () => {
      const command = new PublishCommand()

      await expectError(() => command.action({
        garden,
        log,
        args: {
          modules: ["module-a"],
        },
        opts: {
          "allow-dirty": false,
          "force-build": false,
        },
      }), "runtime")
    })

    it("should optionally allow publishing dirty commits", async () => {
      const command = new PublishCommand()

      const { result } = await command.action({
        garden,
        log,
        args: {
          modules: ["module-a"],
        },
        opts: {
          "allow-dirty": true,
          "force-build": true,
        },
      })

      expect(taskResultOutputs(result!)).to.eql({
        "build.module-a": { fresh: true },
        "publish.module-a": { published: true },
      })
    })
  })
})
