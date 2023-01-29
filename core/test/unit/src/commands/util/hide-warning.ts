/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { withDefaultGlobalOpts, projectRootA, makeTestGarden } from "../../../../helpers"
import { expect } from "chai"
import { HideWarningCommand } from "../../../../../src/commands/util/hide-warning"
import { randomString } from "../../../../../src/util/string"
import { getLogMessages } from "../../../../../src/util/testing"

describe("HideWarningCommand", () => {
  it("should hide a warning message", async () => {
    const garden = await makeTestGarden(projectRootA)
    const log = garden.log.placeholder()
    const cmd = new HideWarningCommand()
    const key = randomString(10)

    try {
      await cmd.action({
        garden,
        args: { key },
        opts: withDefaultGlobalOpts({}),
        log: garden.log,
        headerLog: garden.log,
        footerLog: garden.log,
      })
      await garden.emitWarning({
        key,
        log,
        message: "foo",
      })
      expect(getLogMessages(log).length).to.equal(0)
    } finally {
      await garden.configStore.delete("warnings", key)
    }
  })
})
