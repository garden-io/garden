/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import * as td from "testdouble"
import type { TempDirectory } from "../../../helpers.js"
import { expectError, getDataDir, makeTempDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import { AuthRedirectServer, getStoredAuthToken, saveAuthToken } from "../../../../src/cloud/api-legacy/auth.js"

import { LoginCommand, rewriteProjectConfigYaml } from "../../../../src/commands/login.js"
import { randomString } from "../../../../src/util/string.js"
import { GardenCloudApiLegacy } from "../../../../src/cloud/api-legacy/api.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { gardenEnv } from "../../../../src/constants.js"
import { getLogMessages } from "../../../../src/util/testing.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import type { Garden } from "../../../../src/index.js"
import { FakeGardenCloudApiLegacy } from "../../../helpers/api.js"
import dedent from "dedent"
import { uuidv4 } from "../../../../src/util/random.js"

function loginCommandParams({ garden, opts = { "disable-project-check": false } }: { garden: Garden; opts?: {} }) {
  const log = garden.log
  return {
    garden,
    log,
    args: {},
    opts: withDefaultGlobalOpts({
      ...opts,
    }),
  }
}

// In the tests below we stub out the auth redirect server but still emit the
// token received event.
describe("LoginCommand", () => {
  let tmpDir: TempDirectory
  let globalConfigStore: GlobalConfigStore

  beforeEach(async () => {
    td.replace(AuthRedirectServer.prototype, "start", async () => {})
    td.replace(AuthRedirectServer.prototype, "close", async () => {})

    tmpDir = await makeTempDir()
    globalConfigStore = new GlobalConfigStore(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("should log in if the project has a domain without an id", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should log in if the project has a domain and an id", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should be a no-op if the user is already logged in", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => true)
    td.replace(GardenCloudApiLegacy.prototype, "startInterval", async () => {})

    await command.action(loginCommandParams({ garden }))

    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(logOutput).to.include("You're already logged in to https://example.invalid.")
  })

  it("should log in if the project config uses secrets in project variables", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()

    // NOTE: if we don't use makeDummyGarden it would try to fully resolve the
    // secrets which are not available unless we mock the cloud API instance.
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "secret-in-project-variables"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      sessionId: uuidv4(),
      parentSessionId: undefined,
      globalConfigStore,
    })

    // Need to override the default because we're using DummyGarden
    const cloudDomain = "https://example.invalid"
    Object.assign(garden, { cloudDomain })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))
    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, cloudDomain)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should fall back to the default garden cloud domain when none is defined", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain)

    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should throw if the user has an invalid auth token", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => false)
    td.replace(GardenCloudApiLegacy.prototype, "refreshToken", async () => {
      throw new Error("bummer")
    })

    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await expectError(async () => await command.action(loginCommandParams({ garden })), {
      contains: "bummer",
    })
  })

  context("outside project root", () => {
    let tmpDirOutsideProjectRoot: TempDirectory

    before(async () => {
      tmpDirOutsideProjectRoot = await makeTempDir({ git: false })
    })
    after(async () => {
      await tmpDirOutsideProjectRoot.cleanup()
    })

    it("should not login if outside project root", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()

      // this is a bit of a workaround to run outside of the garden root dir
      const garden = await makeDummyGarden(tmpDirOutsideProjectRoot.path, {
        commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
        sessionId: uuidv4(),
        parentSessionId: undefined,
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await expectError(async () => await command.action(loginCommandParams({ garden, opts: {} })), {
        contains: "Project config not found",
      })
    })
  })

  context("GARDEN_AUTH_TOKEN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_AUTH_TOKEN

    before(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = "my-auth-token"
    })

    after(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = saveEnv
    })

    // const combinations = [
    //   {
    //     description: "an old-style project ID is set in the project config",
    //     expectedBackend: "old",
    //     projectName: "has-domain-and-id",
    //   },
    //   {
    //     description: "no project ID is set in the project config (implying new backend)",
    //     expectedBackend: "new",
    //     projectName: "has-organization-id",
    //   },
    // ]

    it("should be a no-op if the user has a valid auth token in the environment", async () => {
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
        globalConfigStore,
        // FakeCloudApi bypasses the login and returns mock project data
        overrideCloudApiLegacyFactory: FakeGardenCloudApiLegacy.factory,
      })

      // Mock this because login command calls it
      td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => true)

      await command.action(loginCommandParams({ garden }))

      const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

      expect(logOutput).to.include("You're already logged in to https://example.invalid.")
    })

    it("should throw if the user has an invalid auth token in the environment", async () => {
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
        globalConfigStore,
        // FakeCloudApi bypasses the login and returns mock project data
        overrideCloudApiLegacyFactory: FakeGardenCloudApiLegacy.factory,
      })

      // Mock this because login command calls it
      td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => false)

      await expectError(async () => await command.action(loginCommandParams({ garden })), {
        contains: `The provided access token is expired or has been revoked for ${garden.cloudDomain}, please create a new one from the Garden Enterprise UI`,
      })
    })
  })

  context("GARDEN_CLOUD_DOMAIN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_CLOUD_DOMAIN

    before(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = "https://example.invalid"
    })

    after(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = saveEnv
    })

    it("should log in even if the project config domain is empty", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
        globalConfigStore,
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(loginCommandParams({ garden }))

      const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, gardenEnv.GARDEN_CLOUD_DOMAIN)
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql(testToken.token)
      expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    })

    it("should log in using the domain in GARDEN_CLOUD_DOMAIN", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
        globalConfigStore,
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(loginCommandParams({ garden }))

      const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, gardenEnv.GARDEN_CLOUD_DOMAIN)
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql(testToken.token)
      expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

      const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

      expect(logOutput).to.include(`Logging in to ${gardenEnv.GARDEN_CLOUD_DOMAIN}`)
    })
  })

  describe("setOrganizationIdAndWrite", () => {
    it("should set the organizationId in a project config on disk, inserting it after the name field", async () => {
      const beforeYaml = dedent`
        kind: Project
        # This comment should be preserved
        name: test-project
        variables:
          foo: bar
        environments:
          - name: local
        providers:
          - name: local-kubernetes
            environments:
              - local
        ---
        # We don't validate this doc, so we don't need all the fields, but we want to make sure
        # That this doc is included unchanged in the output.
        kind: Build
      `
      const organizationId = "gandalf-1445"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })
      expect(afterYaml.trim()).to.equal(
        dedent`
        kind: Project
        # This comment should be preserved
        name: test-project
        organizationId: ${organizationId}
        variables:
          foo: bar
        environments:
          - name: local
        providers:
          - name: local-kubernetes
            environments:
              - local
        ---
        # We don't validate this doc, so we don't need all the fields, but we want to make sure
        # That this doc is included unchanged in the output.
        kind: Build
      `.trim()
      )
    })

    it("should comment out the id field when commentOutLegacyFields is true", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        variables:
          foo: bar
      `
      const organizationId = "org-456"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: true,
      })

      expect(afterYaml).to.include("organizationId: org-456")
      expect(afterYaml).to.include("# id: legacy-project-123")
      expect(afterYaml).to.include("# Legacy field, no longer needed")
      expect(afterYaml).not.to.match(/^id:/m) // No uncommented id field
    })

    it("should comment out both id and domain fields when commentOutLegacyFields is true", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        domain: https://old.example.com
        variables:
          foo: bar
      `
      const organizationId = "org-456"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: true,
      })

      expect(afterYaml).to.include("organizationId: org-456")
      expect(afterYaml).to.include("# id: legacy-project-123")
      expect(afterYaml).to.include("# domain: https://old.example.com")
      expect(afterYaml).not.to.match(/^id:/m)
      expect(afterYaml).not.to.match(/^domain:/m)
    })

    it("should update existing organizationId and comment out legacy fields", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        organizationId: org-old-wrong
        id: legacy-project-123
        domain: https://old.example.com
        variables:
          foo: bar
      `
      const organizationId = "org-new-correct"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: true,
      })

      expect(afterYaml).to.include("organizationId: org-new-correct")
      expect(afterYaml).not.to.include("organizationId: org-old-wrong")
      expect(afterYaml).to.include("# id: legacy-project-123")
      expect(afterYaml).to.include("# domain: https://old.example.com")
    })

    it("should preserve existing comments when commenting out legacy fields", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project  # My project
        id: legacy-project-123
        # Important comment here
        variables:
          foo: bar
      `
      const organizationId = "org-456"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: true,
      })

      expect(afterYaml).to.include("# My project")
      expect(afterYaml).to.include("# Important comment here")
      expect(afterYaml).to.include("id: legacy-project-123  # Legacy field, no longer needed")
    })

    it("should handle missing legacy fields gracefully", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        variables:
          foo: bar
      `
      const organizationId = "org-456"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: true,
      })

      // Should add organizationId but not fail on missing id/domain
      expect(afterYaml).to.include("organizationId: org-456")
      expect(afterYaml).to.include("name: test-project")
    })

    it("should not comment out fields when commentOutLegacyFields is false", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        domain: https://old.example.com
      `
      const organizationId = "org-456"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
        legacyProjectId: "legacy-project-123",
        commentOutLegacyFields: false,
      })

      expect(afterYaml).to.include("organizationId: org-456")
      expect(afterYaml).to.include("id: legacy-project-123") // Not commented
      expect(afterYaml).to.include("domain: https://old.example.com") // Not commented
    })

    it("should preserve long URLs without line-wrapping", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        sources:
          - name: frontend
            repositoryUrl: "https://git:\${secrets.TOKEN}@gitlab.com/company/products/team/very-long-project-name.git#\${var.tags.frontend || 'development' }"
      `
      const organizationId = "org-123"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })

      // URL should not be split across multiple lines
      expect(afterYaml).to.include(
        `repositoryUrl: "https://git:\${secrets.TOKEN}@gitlab.com/company/products/team/very-long-project-name.git#\${var.tags.frontend || 'development' }"`
      )
      expect(afterYaml).not.to.include("\\") // No backslash line continuation
    })

    it("should preserve flow-style arrays without adding spaces", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        environments: ["remote", "ci"]
      `
      const organizationId = "org-123"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })

      // Array should remain compact
      expect(afterYaml).to.include('environments: ["remote", "ci"]')
      expect(afterYaml).not.to.include('[ "remote", "ci" ]')
    })

    it("should preserve complex nested structures", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        variables:
          tags: {frontend: "v1.0", backend: "v2.0"}
        providers:
          - name: kubernetes
            environments: ["dev", "staging", "prod"]
      `
      const organizationId = "org-123"
      const afterYaml = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })

      // Inline objects and arrays should be preserved
      expect(afterYaml).to.include('{frontend: "v1.0", backend: "v2.0"}')
      expect(afterYaml).to.include('["dev", "staging", "prod"]')
    })

    it("should produce consistent output on multiple rewrites", () => {
      const beforeYaml = dedent`
        kind: Project
        name: test-project
        environments: ["remote", "ci"]
        sources:
          - name: api
            repositoryUrl: "https://github.com/org/repo.git"
      `
      const organizationId = "org-123"

      // First rewrite
      const afterFirstRewrite = rewriteProjectConfigYaml({
        projectConfigYaml: beforeYaml,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })

      // Second rewrite (simulating running login again)
      const afterSecondRewrite = rewriteProjectConfigYaml({
        projectConfigYaml: afterFirstRewrite,
        projectConfigPath: "/some/dir/project.garden.yml",
        organizationId,
      })

      // Output should be identical
      expect(afterFirstRewrite).to.equal(afterSecondRewrite)
    })
  })
})
