/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ScanCommand } from "../../../../src/commands/scan"
import { withDefaultGlobalOpts, makeTestGardenA } from "../../../helpers"

describe("ScanCommand", () => {
  it(`should successfully scan a test project`, async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new ScanCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })
  })
})
