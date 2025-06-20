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
import { AuthRedirectServer, getStoredAuthToken, saveAuthToken } from "../../../../src/cloud/auth.js"

import { LoginCommand, rewriteProjectConfigYaml } from "../../../../src/commands/login.js"
import { randomString } from "../../../../src/util/string.js"
import { GardenCloudApi } from "../../../../src/cloud/api.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { gardenEnv } from "../../../../src/constants.js"
import { getLogMessages } from "../../../../src/util/testing.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import type { Garden } from "../../../../src/index.js"
import { FakeGardenCloudApi } from "../../../helpers/api.js"
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
    td.replace(GardenCloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(GardenCloudApi.prototype, "startInterval", async () => {})

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
    td.replace(GardenCloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(GardenCloudApi.prototype, "refreshToken", async () => {
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
        overrideCloudApiFactory: FakeGardenCloudApi.factory,
      })

      // Mock this because login command calls it
      td.replace(GardenCloudApi.prototype, "checkClientAuthToken", async () => true)

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
        overrideCloudApiFactory: FakeGardenCloudApi.factory,
      })

      // Mock this because login command calls it
      td.replace(GardenCloudApi.prototype, "checkClientAuthToken", async () => false)

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
      const afterYaml = rewriteProjectConfigYaml(beforeYaml, "/some/dir/project.garden.yml", organizationId)
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
  })
})
