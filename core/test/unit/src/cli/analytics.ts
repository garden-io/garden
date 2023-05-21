/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import nock from "nock"
import { expect } from "chai"

import { GardenCli } from "../../../../src/cli/cli"
import { GlobalConfigStore } from "../../../../src/config-store/global"
import { TestGarden, enableAnalytics, makeTestGardenA } from "../../../helpers"
import { Command } from "../../../../src/commands/base"
import { isEqual } from "lodash"
import { getRootLogger } from "../../../../src/logger/logger"

// TODO: These tests are skipped because they fail repeatedly in CI, but works fine locally
describe("cli analytics", () => {
  let cli: GardenCli
  const globalConfigStore = new GlobalConfigStore()
  const log = getRootLogger().createLog()

  beforeEach(async () => {
    cli = new GardenCli()
    garden = await makeTestGardenA()
    resetAnalyticsConfig = await enableAnalytics(garden)
  })

  afterEach(async () => {
    if (cli.processRecord && cli.processRecord.pid) {
      await globalConfigStore.delete("activeProcesses", String(cli.processRecord.pid))
    }

    await resetAnalyticsConfig()
    nock.cleanAll()
  })

  let garden: TestGarden
  let resetAnalyticsConfig: Function

  class TestCommand extends Command {
    name = "test-command"
    help = "hilfe!"
    noProject = true

    printHeader() {}

    async action({ args }) {
      return { result: { args } }
    }
  }

  it.skip("should access the version check service", async () => {
    const scope = nock("https://get.garden.io")
    scope.get("/version").query(true).reply(200)

    const command = new TestCommand()
    cli.addCommand(command)

    await cli.run({ args: ["test-command"], exitOnError: false })

    expect(scope.done()).to.not.throw
  })

  it.skip("should wait for queued analytic events to flush", async () => {
    const scope = nock("https://api.segment.io")

    // Each command run result in two events:
    // 'Run Command' and 'Command Result'
    scope
      .post(`/v1/batch`, (body) => {
        const events = body.batch.map((event: any) => ({
          event: event.event,
          type: event.type,
          name: event.properties.name,
        }))

        return isEqual(events, [
          {
            event: "Run Command",
            type: "track",
            name: "test-command",
          },
          {
            event: "Command Result",
            type: "track",
            name: "test-command",
          },
        ])
      })
      .reply(201)

    const command = new TestCommand()
    cli.addCommand(command)

    await cli.run({ args: ["test-command"], exitOnError: false })

    expect(scope.done()).to.not.throw
  })
})
