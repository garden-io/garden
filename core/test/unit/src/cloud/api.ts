/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { gardenEnv } from "../../../../src/constants.js"
import { uuidv4 } from "../../../../src/util/random.js"
import { randomString } from "../../../../src/util/string.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import { clearAuthToken, getAuthToken, saveAuthToken } from "../../../../src/cloud/api-legacy/auth.js"

describe("GardenCloudApi", () => {
  const log = getRootLogger().createLog()
  const domain = "https://garden." + randomString()
  const globalConfigStore = new GlobalConfigStore()

  describe("getAuthToken", () => {
    it("should return null when no auth token is present", async () => {
      const savedToken = await getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.be.undefined
    })

    it("should return a saved auth token when one exists", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain })
      const savedToken = await getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.eql(testToken.token)
    })

    it("should return the value of GARDEN_AUTH_TOKEN if it's present", async () => {
      const tokenBackup = gardenEnv.GARDEN_AUTH_TOKEN
      const testToken = "token-from-env"
      gardenEnv.GARDEN_AUTH_TOKEN = testToken
      try {
        const savedToken = await getAuthToken(log, globalConfigStore, domain)
        expect(savedToken).to.eql(testToken)
      } finally {
        gardenEnv.GARDEN_AUTH_TOKEN = tokenBackup
      }
    })
  })

  describe("clearAuthToken", () => {
    it("should delete a saved auth token", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain })
      await clearAuthToken(log, globalConfigStore, domain)
      const savedToken = await getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.be.undefined
    })

    it("should not throw an exception if no auth token exists", async () => {
      await clearAuthToken(log, globalConfigStore, domain)
      await clearAuthToken(log, globalConfigStore, domain)
    })
  })
})
