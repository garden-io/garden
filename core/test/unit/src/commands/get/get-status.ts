/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGardenA } from "../../../../helpers"
import { GetStatusCommand } from "../../../../../src/commands/get/get-status"
import { withDefaultGlobalOpts } from "../../../../helpers"
import { expect } from "chai"
import { LogLevel } from "../../../../../src/logger/logger"
import { getLogMessages } from "../../../../../src/util/testing"

describe("GetStatusCommand", () => {
  describe("action", () => {
    it("returns statuses for all actions in a project", async () => {
      throw "TODO"
    })

    it("should warn if a service's status can't be resolved", async () => {
      const garden = await makeTestGardenA()
      const command = new GetStatusCommand()
      const log = garden.log

      await garden.setTestActionStatus({
        log,
        kind: "Deploy",
        name: "service-a",
        status: {
          state: "unknown",
          detail: { state: "unknown", detail: {} },
          outputs: {},
        },
      })

      const { result } = await command.action({
        garden,
        log,
        args: {},
        opts: withDefaultGlobalOpts({}),
        headerLog: log,
        footerLog: log,
      })

      expect(command.outputsSchema().validate(result).error).to.be.undefined

      const logMessages = getLogMessages(log, (l) => l.level === LogLevel.warn)

      expect(logMessages).to.include(
        "Unable to resolve status for Deploy service-a. It is likely missing or outdated. This can come up if the deployment has runtime dependencies that are not resolvable, i.e. not deployed or invalid."
      )
    })
  })
})
