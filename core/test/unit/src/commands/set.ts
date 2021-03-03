/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { SetSecretCommand } from "../../../../src/commands/set"
import { makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers"

describe("SetSecretCommand", () => {
  const pluginName = "test-plugin"
  const provider = pluginName

  it("should set a config variable", async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new SetSecretCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { provider, key: "mykey", value: "myvalue" },
      opts: withDefaultGlobalOpts({}),
    })

    const actions = await garden.getActionRouter()
    expect(await actions.getSecret({ log, pluginName, key: "mykey" })).to.eql({ value: "myvalue" })
  })
})
