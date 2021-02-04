/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ExecCommand } from "../../../../src/commands/exec"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"

describe("ExecCommand", () => {
  const command = new ExecCommand()

  it("should exec a command in a running service", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const args = { service: "service-a", command: "echo ok" }

    command.printHeader({ headerLog: log, args })

    const { result, errors } = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args,
      opts: withDefaultGlobalOpts({
        interactive: false,
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(result?.output).to.equal("Ran command: echo ok")
  })
})
