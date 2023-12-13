/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getRootLogger } from "../../../../src/logger/logger.js"
import { gardenEnv } from "../../../../src/constants.js"
import { CloudApi } from "../../../../src/cloud/api.js"
import { uuidv4 } from "../../../../src/util/random.js"
import { randomString } from "../../../../src/util/string.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import nock from "nock"
import { expectError } from "../../../helpers.js"

describe("CloudApi", () => {
  const log = getRootLogger().createLog()
  const domain = "https://garden." + randomString()
  const globalConfigStore = new GlobalConfigStore()

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
      await CloudApi.saveAuthToken(log, globalConfigStore, testToken, domain)
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.eql(testToken.token)
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
      await CloudApi.saveAuthToken(log, globalConfigStore, testToken, domain)
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
      const savedToken = await CloudApi.getAuthToken(log, globalConfigStore, domain)
      expect(savedToken).to.be.undefined
    })

    it("should not throw an exception if no auth token exists", async () => {
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
      await CloudApi.clearAuthToken(log, globalConfigStore, domain)
    })
  })

  describe("factory", async () => {
    let cloudDomain: string

    const storeToken = async () => {
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      await CloudApi.saveAuthToken(log, globalConfigStore, testToken, cloudDomain)
    }

    beforeEach(async () => {
      cloudDomain = "https://garden." + randomString()
    })

    afterEach(async () => {
      await CloudApi.clearAuthToken(log, globalConfigStore, cloudDomain)

      nock.cleanAll()
    })

    it("should not return a CloudApi instance without an auth token", async () => {
      const scope = nock(cloudDomain)

      scope.get("/api/token/verify").reply(404)

      await expectError(
        async () =>
          await CloudApi.factory({
            log,
            globalConfigStore,
            cloudDomain,
            projectId: undefined,
            requireLogin: undefined,
          }),
        {
          type: "cloud-api",
          contains: "No auth token available for",
        }
      )

      // we don't expect a request to verify the token
      expect(scope.isDone()).to.be.false
    })

    it("should return a CloudApi instance if there is a valid token", async () => {
      const scope = nock(cloudDomain)

      scope.get("/api/token/verify").reply(200, {})

      await storeToken()

      const api = await CloudApi.factory({
        log,
        globalConfigStore,
        cloudDomain,
        projectId: undefined,
        requireLogin: undefined,
      })

      expect(scope.isDone()).to.be.true

      expect(api).to.be.instanceOf(CloudApi)
    })

    it("should not return a CloudApi instance without a token even if there is a project id and require login is false", async () => {
      const scope = nock(cloudDomain)

      scope.get("/api/token/verify").reply(200, {})

      await expectError(
        async () =>
          await CloudApi.factory({
            log,
            globalConfigStore,
            cloudDomain,
            projectId: "test",
            requireLogin: false,
          }),
        {
          type: "cloud-api",
          contains: "No auth token available for",
        }
      )

      expect(scope.isDone()).to.be.false
    })

    it("should not return a CloudApi instance with an invalid token when require login is false", async () => {
      const scope = nock(cloudDomain)

      // store a token, but return that its invalid and fail the refresh
      await storeToken()
      scope.get("/api/token/verify").reply(401, {})
      scope.get("/api/token/refresh").reply(401, {})

      await expectError(
        async () =>
          await CloudApi.factory({
            log,
            globalConfigStore,
            cloudDomain,
            projectId: "test",
            requireLogin: false,
          }),
        {
          type: "cloud-api",
          contains: "The auth token could not be refreshed for",
        }
      )

      expect(scope.isDone()).to.be.true
    })

    it("should throw an error when the token is invalid and require login is true", async () => {
      const scope = nock(cloudDomain)

      // store a token, but return that its invalid and fail the refresh
      await storeToken()
      scope.get("/api/token/verify").reply(401, {})
      scope.get("/api/token/refresh").reply(401, {})

      await expectError(
        async () =>
          CloudApi.factory({
            log,
            globalConfigStore,
            cloudDomain,
            projectId: "test",
            requireLogin: true,
          }),
        {
          type: "cloud-api",
          contains: "You are running this in a project with a Garden Cloud ID and logging in is required.",
        }
      )

      expect(scope.isDone()).to.be.true
    })

    it("should not return a CloudApi instance when GARDEN_REQUIRE_LOGIN_OVERRIDE is false", async () => {
      const scope = nock(cloudDomain)

      // store a token, but return that its invalid and fail the refresh
      await storeToken()
      scope.get("/api/token/verify").reply(401, {})
      scope.get("/api/token/refresh").reply(401, {})

      const overrideEnvBackup = gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE

      gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE = false

      try {
        await expectError(
          async () =>
            await CloudApi.factory({
              log,
              globalConfigStore,
              cloudDomain,
              projectId: "test",
              requireLogin: true,
            }),
          {
            type: "cloud-api",
            contains: "The auth token could not be refreshed for",
          }
        )

        expect(scope.isDone()).to.be.true
      } finally {
        gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE = overrideEnvBackup
      }
    })

    it("should throw an error when GARDEN_REQUIRE_LOGIN_OVERRIDE is true", async () => {
      const scope = nock(cloudDomain)

      // store a token, but return that its invalid and fail the refresh
      await storeToken()
      scope.get("/api/token/verify").reply(401, {})
      scope.get("/api/token/refresh").reply(401, {})

      const overrideEnvBackup = gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE

      gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE = true

      try {
        await expectError(
          async () =>
            CloudApi.factory({
              log,
              globalConfigStore,
              cloudDomain,
              projectId: "test",
              requireLogin: true,
            }),
          {
            type: "cloud-api",
            contains: "You are running this in a project with a Garden Cloud ID and logging in is required.",
          }
        )

        expect(scope.isDone()).to.be.true
      } finally {
        gardenEnv.GARDEN_REQUIRE_LOGIN_OVERRIDE = overrideEnvBackup
      }
    })
  })
})
