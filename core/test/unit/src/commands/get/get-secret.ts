/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { expectError, makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"
import { GetSecretCommand } from "../../../../../src/commands/get/get-secret"

describe("GetSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should get a config variable", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetSecretCommand()

    const actions = await garden.getActionRouter()
    await actions.setSecret({
      log,
      pluginName,
      key: "project.mykey",
      value: "myvalue",
    })

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { provider, key: "project.mykey" },
      opts: withDefaultGlobalOpts({}),
    })

    expect(res).to.eql({ "project.mykey": "myvalue" })
  })

  it("should throw on missing key", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new GetSecretCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { provider, key: "project.mykey" },
          opts: withDefaultGlobalOpts({}),
        }),
      "not-found"
    )
  })
})
