/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { withDefaultGlobalOpts, getLogMessages, projectRootA } from "../../../../helpers"
import { expect } from "chai"
import { Warning } from "../../../../../src/db/entities/warning"
import { getConnection } from "../../../../../src/db/connection"
import { HideWarningCommand } from "../../../../../src/commands/util/hide-warning"
import { makeDummyGarden } from "../../../../../src/cli/cli"
import { randomString } from "../../../../../src/util/string"

describe("HideWarningCommand", () => {
  it("should hide a warning message", async () => {
    const garden = await makeDummyGarden(projectRootA)
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
      await Warning.emit({
        key,
        log,
        message: "foo",
      })
      expect(getLogMessages(log).length).to.equal(0)
    } finally {
      await getConnection().getRepository(Warning).createQueryBuilder().delete().where({ key }).execute()
    }
  })
})
