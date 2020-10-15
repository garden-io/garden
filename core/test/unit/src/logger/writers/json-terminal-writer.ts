/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { JsonTerminalWriter } from "../../../../../src/logger/writers/json-terminal-writer"
import { getLogger } from "../../../../../src/logger/logger"
import { freezeTime } from "../../../../helpers"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
})

describe("JsonTerminalWriter", () => {
  describe("render", () => {
    it("should return a JSON-formatted message if level is geq than entry level", () => {
      const now = freezeTime()
      const writer = new JsonTerminalWriter()
      const entry = logger.info("hello logger")
      const out = writer.render(entry, logger)
      expect(out).to.eql(`{"msg":"hello logger","section":"","timestamp":"${now.toISOString()}"}`)
    })
    it("should chain messages with 'append' set to true", () => {
      const now = freezeTime()
      const writer = new JsonTerminalWriter()
      const entry = logger.info("hello logger")
      entry.setState({ msg: "hello again", append: true })
      const out = writer.render(entry, logger)
      expect(out).to.eql(`{"msg":"hello logger - hello again","section":"","timestamp":"${now.toISOString()}"}`)
    })
    it("should return null if message is an empty string", () => {
      const writer = new JsonTerminalWriter()
      const entry = logger.info("")
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
    it("should return null if entry is empty", () => {
      const writer = new JsonTerminalWriter()
      const entry = logger.placeholder()
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
    it("should return null if entry level is geq to writer level", () => {
      const writer = new JsonTerminalWriter()
      const entry = logger.verbose("abc")
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })
  })
})
