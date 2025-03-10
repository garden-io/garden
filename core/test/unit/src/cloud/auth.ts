/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { expect } from "chai"
import { enforceLogin } from "../../../../src/cloud/auth.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import type { CoreLog } from "../../../../src/logger/log-entry.js"
import { getRootLogger, LogLevel } from "../../../../src/logger/logger.js"
import { createProjectConfig, expectError, expectFuzzyMatch, makeTempDir, TestGarden } from "../../../helpers.js"
import type tmp from "tmp-promise"
import { resetNonRepeatableWarningHistory } from "../../../../src/warnings.js"
import { uuidv4 } from "../../../../src/util/random.js"
import { GardenApiVersion } from "../../../../src/constants.js"

describe("enforceLogin", () => {
  let tmpDir: tmp.DirectoryResult
  let pathFoo: string

  async function getTestGarden({
    backend,
    isProjectConnected,
    isLoggedIn,
    apiVersion,
  }: {
    backend: "enterprise" | "app.garden.io"
    isProjectConnected: boolean
    isLoggedIn: boolean
    apiVersion: GardenApiVersion
  }): Promise<{
    log: CoreLog
    garden: TestGarden
  }> {
    const log = getRootLogger().createLog()

    const config: ProjectConfig = createProjectConfig({
      name: "test",
      path: pathFoo,
    })
    config.apiVersion = apiVersion
    if (backend === "enterprise") {
      config.domain = "https://example.com"
    }
    if (isProjectConnected) {
      config.id = uuidv4()
    }

    const garden = await TestGarden.factory(pathFoo, {
      config,
      environmentString: "default",
      log,
    })

    log.root["entries"] = []
    garden.isLoggedIn = () => isLoggedIn

    return {
      log,
      garden,
    }
  }

  before(async () => {
    tmpDir = await makeTempDir({ git: true })
    pathFoo = tmpDir.path
  })
  beforeEach(() => {
    resetNonRepeatableWarningHistory()
  })

  context("apiVersion=garden.io/v1 + Enterprise project not connected + Not using offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = false
    const backend = "enterprise"
    const isOfflineModeEnabled = false

    it(`even if logged in, warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
    it(`if not logged in, nudge the user to login and warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(2)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
      expectFuzzyMatch(actualLog[1].msg, [
        `You are not logged in. To use Garden Enterprise, log in with the garden login command.`,
      ])
    })
  })

  context("apiVersion=garden.io/v1 + Enterprise project not connected + Using --offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = false
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`if not logged in, should warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
    it(`if user is logged in, should warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
  })

  context("apiVersion=garden.io/v1 + Enterprise project is connected + Not using offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = false

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, should nudge the user to log in and should warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(2)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: for projects that are connected to garden cloud/enterprise, garden 0.14 will require you to login.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#loginrequirement`,
      ])

      expect(actualLog[1].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[1].msg, [
        `You are not logged in. To use Garden Enterprise, log in with the garden login command.`,
      ])
    })
  })

  context("apiVersion=garden.io/v1 + Enterprise project is connected + using --offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`should not print any warnings if user is not logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v1 + Community project is not connected + not using offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = false

    it(`even if logged in, warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
    it(`if not logged in, nudge the user to login and warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(2)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
      expect(actualLog[1].level).to.eql(LogLevel.info)
      expectFuzzyMatch(actualLog[1].msg, [
        `You are not logged in. To use the Garden Dashboard, log in with the garden login command.`,
      ])
    })
  })

  context("apiVersion=garden.io/v1 + Community project is not connected + using --offline mode", () => {
    const apiVersion = GardenApiVersion.v1
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = true

    it(`even if logged in, warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
    it(`if not logged in, nudge the user to login and warn about configmap-based cache not available in garden 0.14`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        `warning: the configmap-based cache will not be available anymore in garden 0.14.`,
        `to make sure your configuration does not break when we release garden 0.14, please follow the steps at https://docs.garden.io/bonsai-0.13/guides/deprecations#configmapbasedcache`,
      ])
    })
  })

  // TODO: 0.14 add tests for the case where community project is connected

  context("apiVersion=garden.io/v2 + Enterprise project not connected + Not using offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = false
    const backend = "enterprise"
    const isOfflineModeEnabled = false

    it(`do not warn as the new behaviour has been adopted + user is logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, nudge the user to login`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(1)
      expect(actualLog[0].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[0].msg, [
        // TODO 0.14: nudge the user to log in at the end of the command execution
        `You are not logged in. To use Garden Enterprise, log in with the garden login command.`,
      ])
    })
  })

  context("apiVersion=garden.io/v2 + Enterprise project not connected + Using --offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = false
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`should not do anything if user is logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`should not do anything if not logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v2 + Enterprise project is connected + Not using offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = false

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
    it(`should enforce login`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      await expectError(
        () => {
          enforceLogin({ garden, log, isOfflineModeEnabled })
        },
        {
          contains: [
            "Login required: This project is connected to Garden Cloud. Please run garden login to authenticate.",
            "NOTE: If you cannot log in right now, use the option --offline or the environment variable GARDEN_OFFLINE=true to enable offline mode. Garden Cloud features won't be available in the offline mode.",
          ],
        }
      )
    })
  })

  context("apiVersion=garden.io/v2 + Enterprise project is connected + using --offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`should not print any warnings if user is not logged in`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v2 + Community project is not connected + not using offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = false

    it(`even if logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, nudge the user to login`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(1)
      // TODO(0.14): Nudge the user to connect the project at the end of command execution
      expect(actualLog[0].level).to.eql(LogLevel.info)
      expectFuzzyMatch(actualLog[0].msg, [
        `You are not logged in. To use the Garden Dashboard, log in with the garden login command.`,
      ])
    })
  })

  context("apiVersion=garden.io/v2 + Community project is not connected + using --offline mode", () => {
    const apiVersion = GardenApiVersion.v2
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = true

    it(`if logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ apiVersion, backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
  })

  // TODO: 0.14 add tests for the case where community project is connected
})
