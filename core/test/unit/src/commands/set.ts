/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { SetDefaultEnvCommand } from "../../../../src/commands/set.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError, makeTestGardenA, withDefaultGlobalOpts } from "../../../helpers.js"

describe("SetDefaultEnvCommand", () => {
  const command = new SetDefaultEnvCommand()

  let garden: TestGarden
  let log: Log

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("sets the specified environment as default env", async () => {
    await command.action({
      garden,
      log,
      args: { env: "other" },
      opts: withDefaultGlobalOpts({}),
    })

    const defaultEnv = await garden.localConfigStore.get("defaultEnv")

    expect(defaultEnv).to.equal("other")
  })

  it("throws an error on setting an invalid environment as the default env", async () => {
    await expectError(
      () =>
        command.action({
          garden,
          log,
          args: { env: "wrong-env" },
          opts: withDefaultGlobalOpts({}),
        }),
      (err) => {
        expect(err.message).to.contain("Invalid environment wrong-env specified as argument.")
      }
    )
  })

  it("clears the specified environment if no args given", async () => {
    await garden.localConfigStore.set("defaultEnv", "other")

    await command.action({
      garden,
      log,
      args: { env: undefined },
      opts: withDefaultGlobalOpts({}),
    })

    const defaultEnv = await garden.localConfigStore.get("defaultEnv")

    expect(defaultEnv).to.equal("")
  })

  it("clears the specified environment if given an empty string", async () => {
    await garden.localConfigStore.set("defaultEnv", "other")

    await command.action({
      garden,
      log,
      args: { env: "" },
      opts: withDefaultGlobalOpts({}),
    })

    const defaultEnv = await garden.localConfigStore.get("defaultEnv")

    expect(defaultEnv).to.equal("")
  })
})
