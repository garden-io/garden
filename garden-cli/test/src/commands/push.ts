import chalk from "chalk"
import { it } from "mocha"
import { join } from "path"
import { expect } from "chai"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { parseContainerModule } from "../../../src/plugins/container"
import { PluginFactory } from "../../../src/types/plugin/plugin"
import { PushCommand } from "../../../src/commands/push"
import { makeTestGardenA } from "../../helpers"
import { expectError, taskResultOutputs } from "../../helpers"
import { ModuleVersion } from "../../../src/vcs/base"

const projectRootB = join(__dirname, "..", "..", "data", "test-project-b")

const getModuleBuildStatus = async () => {
  return { ready: true }
}

const buildModule = async () => {
  return { fresh: true }
}

const pushModule = async () => {
  return { pushed: true }
}

const testProvider: PluginFactory = () => {
  return {
    moduleActions: {
      container: {
        parseModule: parseContainerModule,
        getModuleBuildStatus,
        buildModule,
        pushModule,
      },
    },
  }
}

testProvider.pluginName = "test-plugin"

const testProviderB: PluginFactory = () => {
  return {
    moduleActions: {
      container: {
        parseModule: parseContainerModule,
        getModuleBuildStatus,
        buildModule,
      },
    },
  }
}

testProviderB.pluginName = "test-plugin-b"

const testProviderNoPush: PluginFactory = () => {
  return {
    moduleActions: {
      container: {
        parseModule: parseContainerModule,
        getModuleBuildStatus,
        buildModule,
      },
    },
  }
}

testProviderNoPush.pluginName = "test-plugin"

async function getTestGarden() {
  const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
  await garden.clearBuilds()
  return { garden, ctx: garden.getPluginContext() }
}

describe("PushCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.

  it("should build and push modules in a project", async () => {
    const { garden, ctx } = await getTestGarden()
    const command = new PushCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        module: undefined,
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "build.module-b": { fresh: false },
      "push.module-a": { pushed: true },
      "push.module-b": { pushed: true },
      "push.module-c": { pushed: false },
    })
  })

  it("should optionally force new build", async () => {
    const { garden, ctx } = await getTestGarden()
    const command = new PushCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        module: undefined,
      },
      opts: {
        "allow-dirty": false,
        "force-build": true,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: true },
      "build.module-b": { fresh: true },
      "push.module-a": { pushed: true },
      "push.module-b": { pushed: true },
      "push.module-c": { pushed: false },
    })
  })

  it("should optionally build selected module", async () => {
    const { garden, ctx } = await getTestGarden()
    const command = new PushCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        module: ["module-a"],
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "build.module-a": { fresh: false },
      "push.module-a": { pushed: true },
    })
  })

  it("should respect allowPush flag", async () => {
    const { garden, ctx } = await getTestGarden()
    const command = new PushCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        module: ["module-c"],
      },
      opts: {
        "allow-dirty": false,
        "force-build": false,
      },
    })

    expect(taskResultOutputs(result!)).to.eql({
      "push.module-c": { pushed: false },
    })
  })

  it("should fail gracefully if module does not have a provider for push", async () => {
    const garden = await makeTestGardenA()
    const ctx = garden.getPluginContext()
    await garden.clearBuilds()

    const command = new PushCommand()

    const { result } = await command.action({
      garden,
      ctx,
      args: {
        module: ["module-a"],
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
      "push.module-a": { pushed: false, message: chalk.yellow("No push handler available for module type test") },
    })
  })

  context("module is dirty", () => {
    let garden

    beforeEach(async () => {
      td.replace(Garden.prototype, "resolveVersion", async (): Promise<ModuleVersion> => {
        return {
          versionString: "012345",
          dirtyTimestamp: 12345,
          dependencyVersions: {},
        }
      })
      garden = (await getTestGarden()).garden
    })

    it("should throw if module is dirty", async () => {
      const ctx = garden.getPluginContext()
      const command = new PushCommand()

      await expectError(() => command.action({
        garden,
        ctx,
        args: {
          module: ["module-a"],
        },
        opts: {
          "allow-dirty": false,
          "force-build": false,
        },
      }), "runtime")
    })

    it("should optionally allow pushing dirty commits", async () => {
      const ctx = garden.getPluginContext()
      const command = new PushCommand()

      const { result } = await command.action({
        garden,
        ctx,
        args: {
          module: ["module-a"],
        },
        opts: {
          "allow-dirty": true,
          "force-build": true,
        },
      })

      expect(taskResultOutputs(result!)).to.eql({
        "build.module-a": { fresh: true },
        "push.module-a": { pushed: true },
      })
    })
  })
})
