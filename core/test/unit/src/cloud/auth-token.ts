/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getRootLogger } from "../../../../src/logger/logger"
import { gardenEnv } from "../../../../src/constants"
import { CloudApi, CloudUserProfile } from "../../../../src/cloud/api"
import { uuidv4 } from "../../../../src/util/random"
import { randomString } from "../../../../src/util/string"
import { GlobalConfigStore } from "../../../../src/config-store/global"
import { makeTempDir, TempDirectory } from "../../../helpers"

describe("AuthToken", () => {
  const log = getRootLogger().createLog()
  let domain: string
  let globalConfigStore: GlobalConfigStore
  let tmpDir: TempDirectory

  beforeEach(async () => {
    domain = "https://garden." + randomString()
    tmpDir = await makeTempDir({ git: false })
    globalConfigStore = new GlobalConfigStore(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("getAuthToken", () => {
    it("should return null when no auth token is present", async () => {
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.be.undefined
    })

    it("should return a saved auth token when one exists", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await CloudApi.saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain })
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.eql(testToken.token)
    })

    it("should return a user profile if stored", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      const userProfile: CloudUserProfile = {
        userId: "some-uuid",
        organizationName: "some-org-name",
        domain,
      }

      await CloudApi.saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain, userProfile })
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.eql(testToken.token)

      const savedProfile = await CloudApi.getAuthTokenUserProfile(log, globalConfigStore, domain)
      expect(savedProfile).to.eql(userProfile)
    })

    it("should not return a user profile when the token has expired", async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: -9999,
      }
      const userProfile: CloudUserProfile = {
        userId: "some-uuid",
        organizationName: "some-org-name",
        domain,
      }

      await CloudApi.saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain, userProfile })
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.eql(testToken.token)

      const savedProfile = await CloudApi.getAuthTokenUserProfile(log, globalConfigStore, domain)
      expect(savedProfile).to.be.undefined
    })

    it("should return the value of GARDEN_AUTH_TOKEN if it's present", async () => {
      const tokenBackup = gardenEnv.GARDEN_AUTH_TOKEN
      const testToken = "token-from-env"
      gardenEnv.GARDEN_AUTH_TOKEN = testToken
      try {
        const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
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
      await CloudApi.saveAuthToken({ log, globalConfigStore, tokenResponse: testToken, domain })
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.be.undefined
    })

    it("should not throw an exception if no auth token exists", async () => {
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
    })
  })
})
