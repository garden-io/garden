/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ValidateCommand } from "../../../../../src/commands/validate"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers"

describe("OpenShift provider", () => {
  it("should pass validation", async () => {
    const projectRoot = getDataDir("openshift", "demo-project")
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new ValidateCommand()
    await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })
  })
})
