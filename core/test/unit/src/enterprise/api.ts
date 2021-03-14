/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { expect } from "chai"
import { ClientAuthToken } from "../../../../src/db/entities/client-auth-token"
import { getLogger } from "../../../../src/logger/logger"
import { gardenEnv } from "../../../../src/constants"
import { EnterpriseApi } from "../../../../src/enterprise/api"
import { add } from "date-fns"
import { uuidv4 } from "../../../../src/util/util"
import { cleanupAuthTokens } from "../../../helpers"

/**
 * Note: Running these tests locally will delete your saved auth token, if any.
 */
describe("EnterpriseApi", () => {
  const log = getLogger().placeholder()

  after(cleanupAuthTokens)

  describe("saveAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should persist an auth token to the local config db", async () => {
      const testAuthToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await EnterpriseApi.saveAuthToken(log, testAuthToken)
      const savedToken = await ClientAuthToken.findOne()
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql(testAuthToken.token)
    })

    it("should never persist more than one auth token to the local config db", async () => {
      await Bluebird.map(
        [
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            tokenValidity: 9999,
          },
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            tokenValidity: 9999,
          },
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            tokenValidity: 9999,
          },
        ],
        async (token) => {
          await EnterpriseApi.saveAuthToken(log, token)
        }
      )
      const count = await ClientAuthToken.count()
      expect(count).to.eql(1)
    })
  })

  describe("getAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should return null when no auth token is present", async () => {
      const savedToken = await EnterpriseApi.getAuthToken(log)
      expect(savedToken).to.be.undefined
    })

    it("should return a saved auth token when one exists", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await EnterpriseApi.saveAuthToken(log, testToken)
      const savedToken = await EnterpriseApi.getAuthToken(log)
      expect(savedToken).to.eql(testToken.token)
    })

    it("should return the value of GARDEN_AUTH_TOKEN if it's present", async () => {
      const tokenBackup = gardenEnv.GARDEN_AUTH_TOKEN
      const testToken = "token-from-env"
      gardenEnv.GARDEN_AUTH_TOKEN = testToken
      try {
        const savedToken = await EnterpriseApi.getAuthToken(log)
        expect(savedToken).to.eql(testToken)
      } finally {
        gardenEnv.GARDEN_AUTH_TOKEN = tokenBackup
      }
    })

    it("should clean up duplicate auth tokens in the erroneous case when several exist", async () => {
      await Bluebird.map(
        [
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            validity: add(new Date(), { seconds: 3600 }),
          },
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            validity: add(new Date(), { seconds: 3600 }),
          },
          {
            token: uuidv4(),
            refreshToken: uuidv4(),
            validity: add(new Date(), { seconds: 3600 }),
          },
        ],
        async (token) => {
          await ClientAuthToken.createQueryBuilder().insert().values(token).execute()
        }
      )
      await EnterpriseApi.getAuthToken(log)
      const count = await ClientAuthToken.count()
      expect(count).to.eql(1)
    })
  })

  describe("clearAuthToken", () => {
    beforeEach(cleanupAuthTokens)

    it("should delete a saved auth token", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await EnterpriseApi.saveAuthToken(log, testToken)
      await EnterpriseApi.clearAuthToken(log)
      const count = await ClientAuthToken.count()
      expect(count).to.eql(0)
    })

    it("should not throw an exception if no auth token exists", async () => {
      await EnterpriseApi.clearAuthToken(log)
    })
  })
})
