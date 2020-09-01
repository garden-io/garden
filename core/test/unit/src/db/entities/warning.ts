/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { randomString } from "../../../../../src/util/string"
import { ensureConnected, getConnection } from "../../../../../src/db/connection"
import { Warning } from "../../../../../src/db/entities/warning"
import { getLogger } from "../../../../../src/logger/logger"
import { getLogMessages } from "../../../../helpers"

describe("Warning", () => {
  const key = randomString(10)

  before(async () => {
    await ensureConnected()
  })

  afterEach(async () => {
    await getConnection().getRepository(Warning).createQueryBuilder().delete().where({ key }).execute()
  })

  describe("hide", () => {
    it("should flag a warning key as hidden", async () => {
      await Warning.hide(key)
      const record = await Warning.findOneOrFail({ where: { key } })
      expect(record.hidden).to.be.true
    })

    it("should be a no-op if a key is already hidden", async () => {
      await Warning.hide(key)
      await Warning.hide(key)
    })
  })

  describe("emit", () => {
    it("should log a warning if the key has not been hidden", async () => {
      const log = getLogger().placeholder()
      const message = "Oh noes!"
      await Warning.emit({ key, log, message })
      const logs = getLogMessages(log)
      expect(logs.length).to.equal(1)
      expect(logs[0]).to.equal(message + `\nRun garden util hide-warning ${key} to disable this warning.`)
    })

    it("should not log a warning if the key has been hidden", async () => {
      const log = getLogger().placeholder()
      const message = "Oh noes!"
      await Warning.hide(key)
      await Warning.emit({ key, log, message })
      const logs = getLogMessages(log)
      expect(logs.length).to.equal(0)
    })
  })
})
