/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import { RuntimeError } from "../../../../../src/exceptions"

import { getRootLogger, Logger, LogLevel } from "../../../../../src/logger/logger"
import { renderError } from "../../../../../src/logger/renderers"
import { render } from "../../../../../src/logger/writers/file-writer"

const logger: Logger = getRootLogger()

beforeEach(() => {
  logger["entries"] = []
})

describe("FileWriter", () => {
  describe("render", () => {
    it("should render message without ansi characters", () => {
      const entry = logger.createLog().info(chalk.red("hello")).getLatestEntry()
      expect(render(LogLevel.info, entry)).to.equal("hello")
    })
    it("should render error object if passed", () => {
      const entry = logger
        .createLog()
        .error({ error: new RuntimeError({ message: "oh no", detail: { foo: "bar" } }) })
        .getLatestEntry()
      const expectedOutput = stripAnsi(renderError(entry))
      expect(render(LogLevel.info, entry)).to.equal(expectedOutput)
    })
    it("should return null if entry level is geq to writer level", () => {
      const entry = logger.createLog().silly("silly").getLatestEntry()
      expect(render(LogLevel.info, entry)).to.equal(null)
    })
  })
})
