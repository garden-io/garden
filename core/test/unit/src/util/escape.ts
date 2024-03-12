/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { commandListToShellScript } from "../../../../src/util/escape.js"

describe("commandListToShellScript", () => {
  it("transforms a list of command line arguments to a shell script", () => {
    const commandList = ["echo", "hello", "world"]
    const commandString = commandListToShellScript(commandList)
    expect(commandString).to.equal("'echo' 'hello' 'world'")
  })

  it("escapes single quotes in command line arguments", () => {
    const commandList = ["echo", "hello", "world's"]
    const commandString = commandListToShellScript(commandList)
    expect(commandString).to.equal(`'echo' 'hello' 'world'"'"'s'`)
  })

  it("replaces all single quotes", () => {
    const commandList = ["echo", "'''"]
    const commandString = commandListToShellScript(commandList)
    expect(commandString).to.equal(`'echo' ''"'"''"'"''"'"''`)
  })

  it("avoids shell injection attacks if used properly", () => {
    const commandList = ["echo", "'; exec ls /"]
    const commandString = commandListToShellScript(commandList)
    expect(commandString).to.equal(`'echo' ''"'"'; exec ls /'`)
  })
})
