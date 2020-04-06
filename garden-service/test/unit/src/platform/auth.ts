/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { expect } from "chai"
import { ClientAuthToken } from "../../../../src/db/entities/client-auth-token"
import { makeTestGardenA } from "../../../helpers"
import { saveAuthToken, readAuthToken, clearAuthToken } from "../../../../src/platform/auth"

async function cleanupAuthTokens() {
  await ClientAuthToken.createQueryBuilder()
    .delete()
    .execute()
}

/**
 * Note: Running these tests locally will delete your saved auth token, if any.
 */
describe("auth", () => {
  after(cleanupAuthTokens)

  describe("saveAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should persist an auth token to the local config db", async () => {
      const garden = await makeTestGardenA()
      await saveAuthToken("test-token", garden.log)
      const savedToken = await ClientAuthToken.findOne()
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql("test-token")
    })

    it("should never persist more than one auth token to the local config db", async () => {
      const garden = await makeTestGardenA()
      await Bluebird.map(["token-a", "token-b", "token-c"], async (token) => {
        await saveAuthToken(token, garden.log)
      })
      const count = await ClientAuthToken.count()
      expect(count).to.eql(1)
    })
  })

  describe("readAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should return null when no auth token is present", async () => {
      const garden = await makeTestGardenA()
      const savedToken = await readAuthToken(garden.log)
      expect(savedToken).to.be.null
    })

    it("should return a saved auth token when one exists", async () => {
      const garden = await makeTestGardenA()
      const testToken = "test-token"
      await saveAuthToken(testToken, garden.log)
      const savedToken = await readAuthToken(garden.log)
      expect(savedToken).to.eql("test-token")
    })

    it("should clean up duplicate auth tokens in the erroneous case when several exist", async () => {
      const garden = await makeTestGardenA()
      await Bluebird.map(["token-1", "token-2", "token-3"], async (token) => {
        await ClientAuthToken.createQueryBuilder()
          .insert()
          .values({ token })
          .execute()
      })
      await readAuthToken(garden.log)
      const count = await ClientAuthToken.count()
      expect(count).to.eql(1)
    })
  })

  describe("clearAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should delete a saved auth token", async () => {
      const garden = await makeTestGardenA()
      await saveAuthToken("test-token", garden.log)
      await clearAuthToken(garden.log)
      const count = await ClientAuthToken.count()
      expect(count).to.eql(0)
    })

    it("should not throw an exception if no auth token exists", async () => {
      const garden = await makeTestGardenA()
      await clearAuthToken(garden.log)
    })
  })
})
