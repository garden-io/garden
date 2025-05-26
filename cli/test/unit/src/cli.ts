/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { find } from "lodash-es"
import { resolve } from "path"

import { runCli, getBundledPlugins } from "../../../src/cli.js"
import { testRoot } from "../../helpers.js"

import { projectRootA } from "@garden-io/core/build/test/helpers.js"
import { TestGardenCli } from "@garden-io/core/build/test/helpers/cli.js"
import type { CommandParams } from "@garden-io/core/build/src/commands/base.js"
import { Command } from "@garden-io/core/build/src/commands/base.js"
import { randomString } from "@garden-io/core/build/src/util/string.js"
import { GlobalConfigStore } from "@garden-io/core/build/src/config-store/global.js"
import { testFlags } from "@garden-io/core/build/src/util/util.js"

describe("runCli", () => {
  const globalConfigStore = new GlobalConfigStore()

  before(() => {
    testFlags.disableShutdown = true
  })

  it("should add bundled plugins", async () => {
    const projectRoot = resolve(testRoot, "test-projects", "bundled-projects")
    const { cli, result } = await runCli({
      args: ["tools", "--root", projectRoot],
      initLogger: false,
    })

    if (result?.errors?.length) {
      throw result.errors[0]
    }

    expect(cli!["plugins"].map((p) => p.name)).to.eql(getBundledPlugins().map((p) => p.name))

    const jibTool = result?.result?.tools?.find((t) => t.pluginName === "jib")
    expect(jibTool).to.exist
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
          expect.fail("Could not find process record")
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

    await runCli({ args: [cmd.name, "--root", projectRootA], cli, initLogger: false })

    const allProcesses = Object.values(await globalConfigStore.get("activeProcesses"))
    const record = find(allProcesses, (p) => p.command)

    expect(record).to.be.undefined
  })
})
