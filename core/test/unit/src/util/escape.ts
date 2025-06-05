/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { commandListToShellScript } from "../../../../src/util/escape.js"
import type { Secret } from "../../../../src/util/secrets.js"
import { makeSecret, toClearText } from "../../../../src/util/secrets.js"

describe("commandListToShellScript", () => {
  it("transforms a list of command line arguments to a shell script", () => {
    const command = ["echo", "hello", "world"]
    const script = commandListToShellScript({ command })
    expect(script).to.equal("'echo' 'hello' 'world'")
  })

  it("protects secrets", () => {
    const command = ["echo", "hello", makeSecret("secret")]
    const script = commandListToShellScript({ command })
    expect(script.toString()).to.equal("'echo' 'hello' '***'")
    expect(toClearText(script)).to.equal("'echo' 'hello' 'secret'")
  })

  it("allows adding environment variables to shell script", () => {
    const command = ["docker", "build", "--secret", "id=foo,env=FRUIT"]
    const env = { FRUIT: "banana" }

    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT='banana' 'docker' 'build' '--secret' 'id=foo,env=FRUIT'`)
  })

  it("escapes single quotes in command line arguments", () => {
    const command = ["echo", "hello", "world's"]
    const env = { FRUIT: "banana's" }

    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT='banana'"'"'s' 'echo' 'hello' 'world'"'"'s'`)
  })

  it("replaces all single quotes", () => {
    const command = ["echo", "'''"]
    const env = { FRUIT: "'''" }
    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT=''"'"''"'"''"'"'' 'echo' ''"'"''"'"''"'"''`)
  })

  it("avoids shell injection attacks if used properly", () => {
    const command = ["echo", "'; exec ls /"]
    const env = { FRUIT: "$(exec ls /)" }
    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT='$(exec ls /)' 'echo' ''"'"'; exec ls /'`)
  })

  it("allows multiline input", () => {
    const command = ["echo", "hello\nmultiline\nworld"]
    const env = { FRUIT: "multiline\nbanana" }
    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT='multiline\nbanana' 'echo' 'hello\nmultiline\nworld'`)
  })

  it("allows underscores in variable names", () => {
    const command = ["echo", "hello world"]
    const env = { FRUIT_NAME: "banana" }
    const script = commandListToShellScript({ command, env })
    expect(script).to.equal(`FRUIT_NAME='banana' 'echo' 'hello world'`)
  })

  it("validates environment variable names", () => {
    const command = ["echo", "hello\nmultiline\nworld"]
    const env = { "INVALID_FRUIT${exec ls /}": "banana" }

    expect(() => commandListToShellScript({ command, env })).throws(
      "Invalid environment variable name INVALID_FRUIT${exec ls /}. Alphanumeric letters and underscores are allowed."
    )
  })

  it("it can handle multiple env vars", () => {
    const command = ["wake", "up", makeSecret("neo")]
    const script = commandListToShellScript({
      command,
      env: {
        VAR_1: "hello",
        VAR_2: makeSecret("world"),
        VAR_3: "where",
        VAR_4: "am",
        VAR_5: "I",
      },
    })
    expect(script.toString()).to.equal("VAR_1='hello' VAR_2='***' VAR_3='where' VAR_4='am' VAR_5='I' 'wake' 'up' '***'")
    expect((<Secret>script).unwrapSecretValue()).to.equal(
      "VAR_1='hello' VAR_2='world' VAR_3='where' VAR_4='am' VAR_5='I' 'wake' 'up' 'neo'"
    )
    expect(toClearText(script)).to.equal(
      "VAR_1='hello' VAR_2='world' VAR_3='where' VAR_4='am' VAR_5='I' 'wake' 'up' 'neo'"
    )
  })

  it("it can handle empty command list", () => {
    const command = []
    const script = commandListToShellScript({ command })
    expect(script).to.equal("")
  })

  it("it can handle empty env list", () => {
    const command = []
    const script = commandListToShellScript({ command, env: {} })
    expect(script).to.equal("")
  })

  it("empty env vars do not result in unnecessary whitespace", () => {
    const command = ["echo", "hello"]
    const script = commandListToShellScript({ command, env: {} })
    expect(script).to.equal("'echo' 'hello'")
  })
})
