/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { JsonTerminalWriter } from "../../../../../src/logger/writers/json-terminal-writer.js"
import type { Logger } from "../../../../../src/logger/logger.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import { freezeTime } from "../../../../helpers.js"

const logger: Logger = getRootLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("JsonTerminalWriter", () => {
  describe("render", () => {
    it("should return a JSON-formatted message if level is geq than entry level", () => {
      const now = freezeTime()
      const writer = new JsonTerminalWriter()
      const entry = logger.createLog().info("hello logger").getLatestEntry()
      const out = writer.render(entry, logger)
      expect(out).to.eql(`{"msg":"hello logger","section":"","timestamp":"${now.toISOString()}","level":"info"}`)
    })

    it("should return null if message is an empty string", () => {
      const writer = new JsonTerminalWriter()
      const entry = logger.createLog().info("").getLatestEntry()
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })

    it("should return null if entry level is geq to writer level", () => {
      const writer = new JsonTerminalWriter()
      const entry = logger.createLog().verbose("abc").getLatestEntry()
      const out = writer.render(entry, logger)
      expect(out).to.eql(null)
    })

    it("should render valid JSON if input message is a JSON string", () => {
      const now = freezeTime()
      const writer = new JsonTerminalWriter()
      const entry = logger
        .createLog()
        .info(JSON.stringify({ message: "foo" }))
        .getLatestEntry()
      const out = writer.render(entry, logger)
      expect(out).to.eql(
        `{"msg":"{\\"message\\":\\"foo\\"}","section":"","timestamp":"${now.toISOString()}","level":"info"}`
      )
    })
  })
})
