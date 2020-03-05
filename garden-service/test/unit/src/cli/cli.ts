/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeDummyGarden, GardenCli } from "../../../../src/cli/cli"
import { getDataDir } from "../../../helpers"
import { GARDEN_SERVICE_ROOT } from "../../../../src/constants"
import { join } from "path"
import { Command } from "../../../../src/commands/base"

describe("cli", () => {
  describe("run", () => {
    it("should pass unparsed args to commands", async () => {
      class TestCommand extends Command {
        name = "test-command"
        help = "halp!"
        noProject = true

        async action({ args }) {
          return { result: { args } }
        }
      }

      const command = new TestCommand()
      const cli = new GardenCli()
      cli.addCommand(command, cli["program"])

      const { result } = await cli.parse(["test-command", "some", "args"])
      expect(result).to.eql({ args: { _: ["some", "args"] } })
    })
  })

  describe("makeDummyGarden", () => {
    it("should initialise and resolve config graph in a directory with no project", async () => {
      const garden = await makeDummyGarden(join(GARDEN_SERVICE_ROOT, "tmp", "foobarbas"), {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with invalid config", async () => {
      const root = getDataDir("test-project-invalid-config")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
    it("should initialise and resolve config graph in a project with template strings", async () => {
      const root = getDataDir("test-project-templated")
      const garden = await makeDummyGarden(root, {})
      const dg = await garden.getConfigGraph(garden.log)
      expect(garden).to.be.ok
      expect(await dg.getModules()).to.not.throw
    })
  })
})
