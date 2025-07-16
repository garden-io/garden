/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { expect } from "chai"
import { enforceLogin } from "../../../../src/cloud/legacy/auth.js"
import type { ProjectConfig } from "../../../../src/config/project.js"
import type { CoreLog } from "../../../../src/logger/log-entry.js"
import { getRootLogger, LogLevel } from "../../../../src/logger/logger.js"
import { createProjectConfig, expectError, expectFuzzyMatch, makeTempDir, TestGarden } from "../../../helpers.js"
import type tmp from "tmp-promise"
import { resetNonRepeatableWarningHistory } from "../../../../src/warnings.js"
import { uuidv4 } from "../../../../src/util/random.js"

describe("enforceLogin", () => {
  let tmpDir: tmp.DirectoryResult
  let pathFoo: string

  async function getTestGarden({
    backend,
    isProjectConnected,
    isLoggedIn,
  }: {
    backend: "enterprise" | "app.garden.io"
    isProjectConnected: boolean
    isLoggedIn: boolean
  }): Promise<{
    log: CoreLog
    garden: TestGarden
  }> {
    const log = getRootLogger().createLog()

    const config: ProjectConfig = createProjectConfig({
      name: "test",
      path: pathFoo,
    })
    if (backend === "enterprise") {
      config.domain = "https://example.com"
    }
    if (isProjectConnected && backend === "enterprise") {
      config.id = uuidv4()
    }
    if (isProjectConnected && backend === "app.garden.io") {
      config.organizationId = uuidv4()
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

  context("apiVersion=garden.io/v2 + Enterprise project not connected + Using --offline mode", () => {
    const isProjectConnected = false
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`should not do anything if user is logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`should not do anything if not logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v2 + Enterprise project is connected + Not using offline mode", () => {
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = false

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
    it(`should enforce login`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      await expectError(
        () => {
          enforceLogin({ garden, log, isOfflineModeEnabled })
        },
        {
          contains: [
            "Login required: This project is connected to Garden Cloud. Please run garden login to authenticate or set the GARDEN_AUTH_TOKEN environment variable.",
            "NOTE: If you cannot log in right now, use the option --offline or the environment variable GARDEN_OFFLINE=true to enable offline mode. Team Cache and Container Builder won't be available in the offline mode.",
          ],
        }
      )
    })
  })

  context("apiVersion=garden.io/v2 + Enterprise project is connected + using --offline mode", () => {
    const isProjectConnected = true
    const backend = "enterprise"
    const isOfflineModeEnabled = true

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`should not print any warnings if user is not logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v2 + Community project is not connected + not using offline mode", () => {
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = false

    it(`even if logged in, we need to nudge the user to connect the project so they can benefit grom Garden Cloud`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(2)
      // TODO(0.14): Nudge the user to connect the project at the end of command execution
      expect(actualLog[0].level).to.eql(LogLevel.info)
      expectFuzzyMatch(actualLog[0].msg, [
        `did you know that team cache and container builder can accelerate your container builds and skip repeated execution of tests?`,
      ])
      expect(actualLog[1].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[1].msg, [`run garden login to connect your project to garden cloud.`])
    })
    it(`if not logged in, nudge the to connect the project as well`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(2)
      // TODO(0.14): Nudge the user to connect the project at the end of command execution
      expect(actualLog[0].level).to.eql(LogLevel.info)
      expectFuzzyMatch(actualLog[0].msg, [
        `did you know that team cache and container builder can accelerate your container builds and skip repeated execution of tests?`,
      ])
      expect(actualLog[1].level).to.eql(LogLevel.warn)
      expectFuzzyMatch(actualLog[1].msg, [`run garden login to connect your project to garden cloud.`])
    })
  })

  context("apiVersion=garden.io/v2 + Community project is not connected + using --offline mode", () => {
    const isProjectConnected = false
    const backend = "app.garden.io"
    const isOfflineModeEnabled = true

    it(`if logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
  })

  context("apiVersion=garden.io/v2 + Connected to app.garden.io + not using offline mode", () => {
    const isProjectConnected = true
    const backend = "app.garden.io"
    const isOfflineModeEnabled = false

    it(`should not print any warnings if logged in`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, enforce login`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      await expectError(
        () => {
          enforceLogin({ garden, log, isOfflineModeEnabled })
        },
        {
          contains: [
            "Login required: This project is connected to Garden Cloud. Please run garden login to authenticate or set the GARDEN_AUTH_TOKEN environment variable.",
            "NOTE: If you cannot log in right now, use the option --offline or the environment variable GARDEN_OFFLINE=true to enable offline mode. Team Cache and Container Builder won't be available in the offline mode.",
          ],
        }
      )
    })
  })

  context("apiVersion=garden.io/v2 + Connected to app.garden.io + using --offline mode", () => {
    const isProjectConnected = true
    const backend = "app.garden.io"
    const isOfflineModeEnabled = true

    it(`if logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: true })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()
      expect(actualLog.length).to.eql(0)
    })
    it(`if not logged in, do nothing`, async () => {
      const { garden, log } = await getTestGarden({ backend, isProjectConnected, isLoggedIn: false })

      enforceLogin({ garden, log, isOfflineModeEnabled })

      const actualLog = log.root.getLogEntries()

      expect(actualLog.length).to.eql(0)
    })
  })
})
