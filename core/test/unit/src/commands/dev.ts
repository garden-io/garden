/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { DevCommand } from "../../../../src/commands/dev.js"

// TODO-G2: rename test cases to match the new graph model semantics
describe("DevCommand", () => {
  const command = new DevCommand()

  // async function waitForEvent(garden: TestGarden, name: string) {
  //   return pEvent(<any>garden.events, name, { timeout: 10000 })
  // }

  // async function completeFirstTasks(
  //   garden: TestGarden,
  //   args: ParameterValues<DevCommandArgs>,
  //   opts: ParameterValues<GlobalOptions & DevCommandOpts>
  // ) {
  //   const log = garden.log

  //   await command.prepare({ log, args, opts })

  //   const promise = command
  //     .action({
  //       garden,
  //       log,
  //         //         //       args,
  //       opts,
  //     })
  //     .then(({ errors }) => {
  //       if (errors) {
  //         throw errors[0]
  //       }
  //     })
  //     .catch((err) => {
  //       // eslint-disable-next-line no-console
  //       console.error(err)
  //     })

  //   await waitForEvent(garden, "watchingForChanges")

  //   garden.events.emit("_exit", {})

  //   const completedTasks = garden.events.eventLog
  //     .filter((e) => e.name === "taskComplete")
  //     .map((e) => e.payload["key"])
  //     .filter((key) => !key.startsWith("resolve-module."))
  //     .sort()

  //   return { promise, completedTasks }
  // }

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  // TODO-G2
})
