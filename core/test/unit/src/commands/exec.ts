/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ExecCommand } from "../../../../src/commands/exec.js"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers.js"

describe("ExecCommand", () => {
  const command = new ExecCommand()

  it("should exec a command in a running service", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log

    const args = { deploy: "service-a", command: "" }
    args["--"] = ["echo", "ok"]

    command.printHeader({ log, args })

    const { result, errors } = await command.action({
      garden,
      log,
      args,
      opts: withDefaultGlobalOpts({
        interactive: false,
        target: "",
      }),
    })

    if (errors) {
      throw errors[0]
    }

    expect(result?.output).to.equal("Ran command: echo ok")
  })
})
