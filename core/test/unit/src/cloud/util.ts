/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { getCloudDomain, getBackendType } from "../../../../src/cloud/util.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../../../src/constants.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import { createProjectConfig } from "../../../helpers.js"

describe("cloud util", () => {
  let originalGardenCloudDomain: string | undefined

  beforeEach(() => {
    // Save the original env var value
    originalGardenCloudDomain = gardenEnv.GARDEN_CLOUD_DOMAIN
  })

  afterEach(() => {
    // Restore the original env var value
    if (originalGardenCloudDomain === undefined) {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
    } else {
      gardenEnv.GARDEN_CLOUD_DOMAIN = originalGardenCloudDomain
    }
    // Clean up any pending nock mocks
    nock.cleanAll()
  })

  describe("getCloudDomain", () => {
    it("should return GARDEN_CLOUD_DOMAIN env var when set", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = "https://custom-cloud.example.com"
      const config = createProjectConfig({
        name: "test-project",
        domain: "https://customer.app.garden",
      })

      const result = await getCloudDomain(config)

      expect(result).to.equal("https://custom-cloud.example.com")
      // Verify no HTTP requests were made
      expect(nock.isDone()).to.be.true
    })

    it("should return DEFAULT_GARDEN_CLOUD_DOMAIN when no domain is configured", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
      })

      const result = await getCloudDomain(config)

      expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
      // Verify no HTTP requests were made
      expect(nock.isDone()).to.be.true
    })

    it("should return configured domain when it does not end with .app.garden", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
        domain: "https://custom.example.com",
      })

      const result = await getCloudDomain(config)

      expect(result).to.equal("https://custom.example.com")
      // Verify no HTTP requests were made
      expect(nock.isDone()).to.be.true
    })

    describe("when configured domain ends with .app.garden", () => {
      it("should return DEFAULT_GARDEN_CLOUD_DOMAIN when domain redirects to it", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock the redirect check
        nock("https://customer.app.garden").head("/").reply(301, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

        const result = await getCloudDomain(config)

        expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(nock.isDone()).to.be.true
      })

      it("should handle 302 redirects to default domain", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock the redirect check with 302
        nock("https://customer.app.garden").head("/").reply(302, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

        const result = await getCloudDomain(config)

        expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(nock.isDone()).to.be.true
      })

      it("should handle 307 redirects to default domain", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock the redirect check with 307
        nock("https://customer.app.garden").head("/").reply(307, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

        const result = await getCloudDomain(config)

        expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(nock.isDone()).to.be.true
      })

      it("should handle 308 redirects to default domain", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock the redirect check with 308
        nock("https://customer.app.garden").head("/").reply(308, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

        const result = await getCloudDomain(config)

        expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(nock.isDone()).to.be.true
      })

      it("should handle relative redirect URLs", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock the redirect with a relative URL that matches the default domain
        nock("https://customer.app.garden").head("/").reply(301, undefined, { location: "/some/path" })

        const result = await getCloudDomain(config)

        // Should return the configured domain since relative redirect doesn't match default
        expect(result).to.equal("https://customer.app.garden")
        expect(nock.isDone()).to.be.true
      })

      it("should return configured domain when redirect goes to a different domain", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock redirect to a different domain
        nock("https://customer.app.garden")
          .head("/")
          .reply(301, undefined, { location: "https://other-domain.example.com" })

        const result = await getCloudDomain(config)

        expect(result).to.equal("https://customer.app.garden")
        expect(nock.isDone()).to.be.true
      })

      it("should return configured domain when no redirect occurs (200 response)", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock successful response (no redirect)
        nock("https://customer.app.garden").head("/").reply(200)

        const result = await getCloudDomain(config)

        expect(result).to.equal(customerDomain)
        expect(nock.isDone()).to.be.true
      })

      it("should return configured domain when redirect has no location header", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock redirect without location header
        nock("https://customer.app.garden").head("/").reply(301)

        const result = await getCloudDomain(config)

        expect(result).to.equal(customerDomain)
        expect(nock.isDone()).to.be.true
      })

      it("should return configured domain when fetch fails with network error", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock network error
        nock("https://customer.app.garden").head("/").replyWithError("Network error")

        const result = await getCloudDomain(config)

        expect(result).to.equal(customerDomain)
        expect(nock.isDone()).to.be.true
      })

      it("should return configured domain when fetch times out", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock timeout
        nock("https://customer.app.garden").head("/").replyWithError({ code: "ETIMEDOUT" })

        const result = await getCloudDomain(config)

        expect(result).to.equal(customerDomain)
        expect(nock.isDone()).to.be.true
      })

      it("should handle domains with paths in the configured URL", async () => {
        gardenEnv.GARDEN_CLOUD_DOMAIN = ""
        const customerDomain = "https://customer.app.garden/some/path"
        const config = createProjectConfig({
          name: "test-project",
          domain: customerDomain,
        })

        // Mock redirect - origin should be used (without path)
        nock("https://customer.app.garden").head("/").reply(301, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

        const result = await getCloudDomain(config)

        expect(result).to.equal(DEFAULT_GARDEN_CLOUD_DOMAIN)
        expect(nock.isDone()).to.be.true
      })
    })
  })

  describe("getBackendType", () => {
    it("should return v2 when getCloudDomain returns DEFAULT_GARDEN_CLOUD_DOMAIN", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
        // No domain configured, should fallback to default
      })

      const result = await getBackendType(config)

      expect(result).to.equal("v2")
    })

    it("should return v2 when .app.garden domain redirects to default domain", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
        domain: "https://customer.app.garden",
      })

      // Mock redirect to default domain
      nock("https://customer.app.garden").head("/").reply(301, undefined, { location: DEFAULT_GARDEN_CLOUD_DOMAIN })

      const result = await getBackendType(config)

      expect(result).to.equal("v2")
      expect(nock.isDone()).to.be.true
    })

    it("should return v1 when project has id and custom domain not ending with .app.garden", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config: ProjectConfig = {
        ...createProjectConfig({
          name: "test-project",
          domain: "https://custom.example.com",
        }),
        id: "project-123",
      }

      const result = await getBackendType(config)

      expect(result).to.equal("v1")
    })

    it("should return v2 when project has no id and custom domain not ending with .app.garden", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
        domain: "https://custom.example.com",
      })

      const result = await getBackendType(config)

      expect(result).to.equal("v2")
    })

    it("should return v1 when project has id and .app.garden domain that doesn't redirect", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config: ProjectConfig = {
        ...createProjectConfig({
          name: "test-project",
          domain: "https://customer.app.garden",
        }),
        id: "project-123",
      }

      // Mock no redirect
      nock("https://customer.app.garden").head("/").reply(200)

      const result = await getBackendType(config)

      expect(result).to.equal("v1")
      expect(nock.isDone()).to.be.true
    })

    it("should return v2 when project has no id and .app.garden domain that doesn't redirect", async () => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = ""
      const config = createProjectConfig({
        name: "test-project",
        domain: "https://customer.app.garden",
      })

      // Mock no redirect
      nock("https://customer.app.garden").head("/").reply(200)

      const result = await getBackendType(config)

      expect(result).to.equal("v2")
      expect(nock.isDone()).to.be.true
    })
  })
})
