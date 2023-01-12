/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { RunCommand } from "../../../../src/commands/run"

// TODO-G2: fill in test implementations. use TestCommand tests for reference.

describe("RunCommand", () => {
  const command = new RunCommand()

  it("should perform a single Run", async () => {
    throw "TODO"
  })

  it("should optionally skip tests by name", async () => {
    throw "TODO"
  })

  it("handles --interactive option if single test name is specified", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set and no test name is specified in arguments", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set and multiple test names are specified in arguments", async () => {
    throw "TODO"
  })

  it("throws if --interactive option is set along with --watch", async () => {
    throw "TODO"
  })

  it("throws if no name and no --module flag is set", async () => {
    throw "TODO"
  })

  it("supports '*' as an argument to select all Runs", async () => {
    throw "TODO"
  })

  it("should be protected", async () => {
    expect(command.protected).to.be.true
  })

  it("should skip disabled actions if --force is not set", async () => {
    throw "TODO"
  })

  it("should run disabled actions if --force is set", async () => {
    throw "TODO"
  })

  it("should skip actions from disabled modules", async () => {
    throw "TODO"
  })

  it("selects a test by name from positional argument", async () => {
    throw "TODO"
  })

  it("selects tests by glob from positional argument", async () => {
    throw "TODO"
  })

  it("concatenates positional args and --name flags", async () => {
    throw "TODO"
  })

  it("applies --module filter", async () => {
    throw "TODO"
  })

  it("applies --module filter combined with name argument", async () => {
    throw "TODO"
  })

  it("throws if --module filter specifies module that does not exist", async () => {
    throw "TODO"
  })

  context("when --skip-dependencies is passed", () => {
    it("should not process runtime dependencies", async () => {
      throw "TODO"
    })
  })
})