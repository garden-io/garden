/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { find } from "lodash"
import { resolve } from "path"

import { runCli, bundledPlugins } from "../../../src/cli"
import { testRoot } from "../../helpers"

import { GardenCli } from "@garden-io/core/build/src/cli/cli"
import { projectRootA } from "@garden-io/core/build/test/helpers"
import { Command, CommandParams } from "@garden-io/core/build/src/commands/base"
import { GardenProcess } from "@garden-io/core/build/src/db/entities/garden-process"
import { ensureConnected } from "@garden-io/core/build/src/db/connection"
import { randomString } from "@garden-io/core/build/src/util/string"

describe("runCli", () => {
  before(async () => {
    await ensureConnected()
  })

  it("should add bundled plugins", async () => {
    const projectRoot = resolve(testRoot, "test-projects", "bundled-projects")
    const { cli, result } = await runCli({ args: ["tools", "--root", projectRoot], exitOnError: false })

    expect(cli!["plugins"]).to.eql(bundledPlugins)

    const conftestTool = result?.result?.tools?.find((t) => t.pluginName === "conftest")
    expect(conftestTool).to.exist
  })

  it("should register a GardenProcess entry and pass to cli.run()", (done) => {
    class TestCommand extends Command {
      name = randomString(10)
      help = "halp!"

      async action({}: CommandParams) {
        const allProcesses = await GardenProcess.getActiveProcesses()
        const record = find(allProcesses, (p) => p.command)

        if (record) {
          done()
        } else {
          done("Couldn't find process record")
        }

        return { result: {} }
      }
    }

    const cli = new GardenCli()
    const cmd = new TestCommand()
    cli.addCommand(cmd)

    runCli({ args: [cmd.name, "--root", projectRootA], cli }).catch(done)
  })

  it("should clean up the GardenProcess entry on exit", async () => {
    class TestCommand extends Command {
      name = randomString(10)
      help = "halp!"

      async action({}: CommandParams) {
        return { result: {} }
      }
    }

    const cli = new GardenCli()
    const cmd = new TestCommand()
    cli.addCommand(cmd)

    await runCli({ args: [cmd.name, "--root", projectRootA], cli })

    const allProcesses = await GardenProcess.getActiveProcesses()
    const record = find(allProcesses, (p) => p.command)

    expect(record).to.be.undefined
  })
})
