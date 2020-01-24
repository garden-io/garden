/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunCommand } from "../../../../../src/commands/run/run"
import { expect } from "chai"

describe("RunCommand", () => {
  it("should do nothing", async () => {
    const cmd = new RunCommand()
    const res = await cmd.action()
    expect(res).to.eql({})
  })

  it("should contain a set of subcommands", () => {
    const cmd = new RunCommand()
    const subcommandNames = cmd.subCommands.map((s) => new s().name)
    expect(subcommandNames).to.eql(["module", "service", "task", "test"])
  })
})
