/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { find } from "lodash"
import { resolve } from "path"

import { runCli, getBundledPlugins } from "../../../src/cli"
import { testRoot } from "../../helpers"

import { projectRootA } from "@worldofgeese/core/build/test/helpers"
import { TestGardenCli } from "@worldofgeese/core/build/test/helpers/cli"
import { Command, CommandParams } from "@worldofgeese/core/build/src/commands/base"
import { randomString } from "@worldofgeese/core/build/src/util/string"
import { GlobalConfigStore } from "@worldofgeese/core/build/src/config-store/global"
import { testFlags } from "@worldofgeese/core/build/src/util/util"

describe("runCli", () => {
  const globalConfigStore = new GlobalConfigStore()

  before(() => {
    testFlags.disableShutdown = true
  })

  it("should add bundled plugins", async () => {
    const projectRoot = resolve(testRoot, "test-projects", "bundled-projects")
    const { cli, result } = await runCli({
      args: ["tools", "--root", projectRoot],
      exitOnError: false,
      initLogger: false,
    })

    expect(cli!["plugins"].map((p) => p.name)).to.eql(getBundledPlugins().map((p) => p.name))

    const conftestTool = result?.result?.tools?.find((t) => t.pluginName === "conftest")
    expect(conftestTool).to.exist
  })

  it("should register a GardenProcess entry and pass to cli.run()", async () => {
    class TestCommand extends Command {
      name = randomString(10)
      help = "halp!"

      override printHeader() {}
      async action({}: CommandParams) {
        const allProcesses = Object.values(await globalConfigStore.get("activeProcesses"))
        const record = find(allProcesses, (p) => p.command)

        if (!record) {
          throw new Error("Could not find process record")
        }

        return { result: {} }
      }
    }

    const cli = new TestGardenCli()
    const cmd = new TestCommand()
    cli.addCommand(cmd)

    const { result } = await runCli({
      args: [cmd.name, "--root", projectRootA],
      cli,
      exitOnError: false,
      initLogger: false,
    })

    expect(result?.errors.length).to.equal(0)
  })

  it("should clean up the GardenProcess entry on exit", async () => {
    class TestCommand extends Command {
      name = randomString(10)
      help = "halp!"

      override printHeader() {}
      async action({}: CommandParams) {
        return { result: {} }
      }
    }

    const cli = new TestGardenCli()
    const cmd = new TestCommand()
    cli.addCommand(cmd)

    await runCli({ args: [cmd.name, "--root", projectRootA], cli, exitOnError: false, initLogger: false })

    const allProcesses = Object.values(await globalConfigStore.get("activeProcesses"))
    const record = find(allProcesses, (p) => p.command)

    expect(record).to.be.undefined
  })
})
