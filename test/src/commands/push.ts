import chalk from "chalk"
import { join } from "path"
import { expect } from "chai"
import * as td from "testdouble"
import { Garden } from "../../../src/garden"
import { parseContainerModule } from "../../../src/plugins/container"
import {
  PluginFactory,
} from "../../../src/types/plugin"
import { Module } from "../../../src/types/module"
import { PushCommand } from "../../../src/commands/push"
import { TreeVersion } from "../../../src/vcs/base"
import {
  expectError,
  taskResultOutputs,
} from "../../helpers"

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

async function getTestContext() {
  const garden = await Garden.factory(projectRootB, { plugins: [testProvider] })
  return garden.pluginContext
}

describe("PushCommand", () => {
  // TODO: Verify that services don't get redeployed when same version is already deployed.

  beforeEach(() => {
    td.replace(Module.prototype, "getVersion", async (): Promise<TreeVersion> => {
      return {
        versionString: "12345",
        latestCommit: "12345",
        dirtyTimestamp: null,
      }
    })
  })

  it("should build and push modules in a project", async () => {
    const ctx = await getTestContext()
    const command = new PushCommand()

    const result = await command.action(
      ctx, {
        module: "",
      },
      {
        "allow-dirty": false,
        "force-build": false,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "build.module-a": { fresh: false },
      "build.module-b": { fresh: false },
      "push.module-a": { pushed: true },
      "push.module-b": { pushed: true },
      "push.module-c": { pushed: false },
    })
  })

  it("should optionally force new build", async () => {
    const ctx = await getTestContext()
    const command = new PushCommand()

    const result = await command.action(
      ctx,
      {
        module: "",
      },
      {
        "allow-dirty": false,
        "force-build": true,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "build.module-a": { fresh: true },
      "build.module-b": { fresh: true },
      "push.module-a": { pushed: true },
      "push.module-b": { pushed: true },
      "push.module-c": { pushed: false },
    })
  })

  it("should optionally build selected module", async () => {
    const ctx = await getTestContext()
    const command = new PushCommand()

    const result = await command.action(
      ctx,
      {
        module: "module-a",
      },
      {
        "allow-dirty": false,
        "force-build": false,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "build.module-a": { fresh: false },
      "push.module-a": { pushed: true },
    })
  })

  it("should respect allowPush flag", async () => {
    const ctx = await getTestContext()
    const command = new PushCommand()

    const result = await command.action(
      ctx,
      {
        module: "module-c",
      },
      {
        "allow-dirty": false,
        "force-build": false,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "push.module-c": { pushed: false },
    })
  })

  it("should fail gracefully if module does not have a provider for push", async () => {
    const garden = await Garden.factory(projectRootB, { plugins: [testProviderNoPush, testProviderB] })
    const ctx = garden.pluginContext

    const command = new PushCommand()

    const result = await command.action(
      ctx,
      {
        module: "module-a",
      },
      {
        "allow-dirty": false,
        "force-build": false,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "build.module-a": { fresh: false },
      "push.module-a": { pushed: false, message: chalk.yellow("No push handler available for module type container") },
    })
  })

  it("should throw if module is dirty", async () => {
    td.replace(Module.prototype, "getVersion", async (): Promise<TreeVersion> => {
      return {
        versionString: "12345",
        latestCommit: "12345",
        dirtyTimestamp: 12345,
      }
    })

    const ctx = await getTestContext()
    const command = new PushCommand()

    await expectError(() => command.action(
      ctx,
      {
        module: "module-a",
      },
      {
        "allow-dirty": false,
        "force-build": false,
      },
    ), "runtime")
  })

  it("should optionally allow pushing dirty commits", async () => {
    td.replace(Module.prototype, "getVersion", async (): Promise<TreeVersion> => {
      return {
        versionString: "12345",
        latestCommit: "12345",
        dirtyTimestamp: 12345,
      }
    })

    const ctx = await getTestContext()
    const command = new PushCommand()

    const result = await command.action(
      ctx,
      {
        module: "module-a",
      },
      {
        "allow-dirty": true,
        "force-build": true,
      },
    )

    expect(taskResultOutputs(result)).to.eql({
      "build.module-a": { fresh: true },
      "push.module-a": { pushed: true },
    })
  })
})
