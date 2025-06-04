/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { withDefaultGlobalOpts, projectRootA, makeTestGarden } from "../../../../helpers.js"
import { expect } from "chai"
import { HideWarningCommand } from "../../../../../src/commands/util/hide-warning.js"
import { randomString } from "../../../../../src/util/string.js"
import { getLogMessages } from "../../../../../src/util/testing.js"

describe("HideWarningCommand", () => {
  it("should hide a warning message", async () => {
    const garden = await makeTestGarden(projectRootA)
    const log = garden.log.createLog()
    const cmd = new HideWarningCommand()
    const key = randomString(10)

    try {
      await cmd.action({
        garden,
        args: { key },
        opts: withDefaultGlobalOpts({}),
        log: garden.log,
      })
      await garden.emitWarning({
        key,
        log,
        message: "foo",
      })
      expect(getLogMessages(log).length).to.equal(0)
    } finally {
      await garden.localConfigStore.delete("warnings", key)
    }
  })
})
