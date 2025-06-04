/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TerminalWriter } from "../../../../../src/logger/writers/terminal-writer.js"
import type { Logger } from "../../../../../src/logger/logger.js"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import { formatForTerminal } from "../../../../../src/logger/renderers.js"

const logger: Logger = getRootLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("TerminalWriter", () => {
  describe("render", () => {
    it("should return a formatted message if level is geq than entry level", () => {
      const writer = new TerminalWriter()
      const entry = logger.createLog().info("hello logger").getLatestEntry()
      const out = writer.write(entry, logger)
      expect(out).to.eql(formatForTerminal(entry, logger))
    })
    it("should return a new line if message is an empty string", () => {
      const writer = new TerminalWriter()
      const entry = logger.createLog().info("").getLatestEntry()
      const out = writer.write(entry, logger)
      expect(out).to.eql("\n")
    })
  })
})
