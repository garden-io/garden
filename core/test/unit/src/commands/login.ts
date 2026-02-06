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

import {
  LoginCommand,
  replaceOrganizationIdInYaml,
  insertOrganizationIdInYaml,
  commentOutFieldInYaml,
} from "../../../../src/commands/login.js"
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

  describe("insertOrganizationIdInYaml", () => {
    it("should insert organizationId after simple name line", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        variables:
          foo: bar
      `
      const result = insertOrganizationIdInYaml(yaml, "org-123")
      expect(result).to.equal(dedent`
        kind: Project
        name: test-project
        organizationId: org-123
        variables:
          foo: bar
      `)
    })

    it("should insert after name with double-quoted value", () => {
      const yaml = dedent`
        kind: Project
        name: "my-project"
        environments:
          - name: local
      `
      const result = insertOrganizationIdInYaml(yaml, "org-456")
      expect(result).to.include('name: "my-project"\norganizationId: org-456')
    })

    it("should insert after name with single-quoted value", () => {
      const yaml = dedent`
        kind: Project
        name: 'my-project'
        environments:
          - name: local
      `
      const result = insertOrganizationIdInYaml(yaml, "org-789")
      expect(result).to.include("name: 'my-project'\norganizationId: org-789")
    })

    it("should insert after name with trailing comment", () => {
      const yaml = dedent`
        kind: Project
        name: test-project  # My project
        variables:
          foo: bar
      `
      const result = insertOrganizationIdInYaml(yaml, "org-123")
      expect(result).to.include("name: test-project  # My project\norganizationId: org-123")
    })

    it("should preserve all other content unchanged", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        environments: [ "local", "remote", "ci" ]
        variables:
          longUrl: "https://git:\${secrets.TOKEN}@gitlab.com/company/products/team/very-long-project-name.git"
      `
      const result = insertOrganizationIdInYaml(yaml, "org-123")
      // Verify formatting is preserved exactly
      expect(result).to.include('environments: [ "local", "remote", "ci" ]')
      expect(result).to.include(
        'longUrl: "https://git:${secrets.TOKEN}@gitlab.com/company/products/team/very-long-project-name.git"'
      )
    })

    it("should return unchanged if name field not found", () => {
      const yaml = dedent`
        kind: Build
        type: container
      `
      const result = insertOrganizationIdInYaml(yaml, "org-123")
      expect(result).to.equal(yaml)
    })

    it("should only match top-level name field", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        providers:
          - name: kubernetes
      `
      const result = insertOrganizationIdInYaml(yaml, "org-123")
      // Should insert after top-level name, not nested name
      const lines = result.split("\n")
      expect(lines[2]).to.equal("organizationId: org-123")
    })
  })

  describe("commentOutFieldInYaml", () => {
    it("should comment out id field with simple value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        variables:
          foo: bar
      `
      const result = commentOutFieldInYaml(yaml, "id")
      expect(result).to.include("# id: legacy-project-123  # Legacy field, no longer needed")
      expect(result).not.to.match(/^id:/m)
    })

    it("should comment out id field with quoted value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        id: "legacy-project-123"
        variables:
          foo: bar
      `
      const result = commentOutFieldInYaml(yaml, "id")
      expect(result).to.include('# id: "legacy-project-123"  # Legacy field, no longer needed')
    })

    it("should comment out domain field with URL value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        domain: https://old.garden.io
        variables:
          foo: bar
      `
      const result = commentOutFieldInYaml(yaml, "domain")
      expect(result).to.include("# domain: https://old.garden.io  # Legacy field, no longer needed")
    })

    it("should preserve existing trailing comment", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        id: legacy-123  # important id
        variables:
          foo: bar
      `
      const result = commentOutFieldInYaml(yaml, "id")
      expect(result).to.include("# id: legacy-123  # important id  # Legacy field, no longer needed")
    })

    it("should not affect indented fields with same name", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        providers:
          - name: kubernetes
            id: provider-id
      `
      const result = commentOutFieldInYaml(yaml, "id")
      // Top-level id should be commented out
      expect(result).to.include("# id: legacy-project-123  # Legacy field, no longer needed")
      // Nested id should remain unchanged
      expect(result).to.include("    id: provider-id")
    })

    it("should return unchanged if field not found", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        variables:
          foo: bar
      `
      const result = commentOutFieldInYaml(yaml, "id")
      expect(result).to.equal(yaml)
    })

    it("should handle field at end of file without trailing newline", () => {
      const yaml = "kind: Project\nname: test\nid: legacy-123"
      const result = commentOutFieldInYaml(yaml, "id")
      expect(result).to.equal("kind: Project\nname: test\n# id: legacy-123  # Legacy field, no longer needed")
    })
  })

  describe("regex functions integration", () => {
    it("should correctly handle full flow: insert organizationId + comment out legacy fields", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        id: legacy-project-123
        domain: https://old.garden.io
        environments: [ "local", "remote", "ci" ]
        variables:
          longUrl: "https://git:\${secrets.TOKEN}@gitlab.com/org/repo.git"
      `

      // Simulate the full update flow
      let result = insertOrganizationIdInYaml(yaml, "new-org-id")
      result = commentOutFieldInYaml(result, "id")
      result = commentOutFieldInYaml(result, "domain")

      // Verify organizationId was inserted
      expect(result).to.include("organizationId: new-org-id")

      // Verify legacy fields were commented out
      expect(result).to.include("# id: legacy-project-123  # Legacy field, no longer needed")
      expect(result).to.include("# domain: https://old.garden.io  # Legacy field, no longer needed")

      // Verify formatting is preserved exactly
      expect(result).to.include('environments: [ "local", "remote", "ci" ]')
      expect(result).to.include('longUrl: "https://git:${secrets.TOKEN}@gitlab.com/org/repo.git"')
    })
  })

  describe("replaceOrganizationIdInYaml", () => {
    it("should replace unquoted organizationId value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        organizationId: old-org-id
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      expect(result).to.include("organizationId: new-org-id")
      expect(result).not.to.include("old-org-id")
    })

    it("should replace double-quoted organizationId value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        organizationId: "old-org-id"
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      expect(result).to.include('organizationId: "new-org-id"')
      expect(result).not.to.include("old-org-id")
    })

    it("should replace single-quoted organizationId value", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        organizationId: 'old-org-id'
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      expect(result).to.include("organizationId: 'new-org-id'")
      expect(result).not.to.include("old-org-id")
    })

    it("should preserve trailing comments", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        organizationId: old-org-id  # This is important
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      expect(result).to.include("organizationId: new-org-id  # This is important")
    })

    it("should preserve surrounding content exactly", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        organizationId: old-org-id
        environments: [ "local", "remote", "ci" ]
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      // The array formatting should be preserved exactly
      expect(result).to.include('environments: [ "local", "remote", "ci" ]')
    })

    it("should return unchanged content if organizationId not found", () => {
      const yaml = dedent`
        kind: Project
        name: test-project
        variables:
          foo: bar
      `
      const result = replaceOrganizationIdInYaml(yaml, "new-org-id")
      expect(result).to.equal(yaml)
    })
  })
})
