/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import blessed from "neo-blessed"

import { Logger } from "../../../../../src/logger/logger"
import { FullscreenTerminalWriter } from "../../../../../src/logger/writers/fullscreen-terminal-writer"
import { LogLevel } from "../../../../../src/logger/log-node"
import stripAnsi from "strip-ansi"
import { dedent } from "../../../../../src/util/string"
import { Writable, WritableOptions } from "stream"
import chalk from "chalk"

const width = 20
const height = 10

class TestWriter extends FullscreenTerminalWriter {
  protected createScreen() {
    return blessed.screen({
      title: "test",
      smartCSR: true,
      autoPadding: false,
      warnings: true,
      fullUnicode: true,
      ignoreLocked: ["C-c", "C-z"],
      output: new MockStdout(),
    })
  }
}

describe("FullscreenTerminalWriter", () => {
  let writer: TestWriter
  let logger: Logger

  beforeEach(() => {
    // Setting a very long spin interval so that we can control it manually
    writer = new TestWriter(LogLevel.info, 99999999)
    logger = new Logger({ level: LogLevel.info, writers: [writer] })
  })

  function getStrippedContent() {
    return stripAnsi(writer.getContent()).trim()
  }

  describe("onGraphChange", () => {
    it("should correctly render the first entry", () => {
      const one = logger.info("one")

      expect(getStrippedContent()).to.eql("one")
      expect(writer["contentHeight"]).to.equal(1)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
    })

    it("should append a new entry", () => {
      const one = logger.info("one")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        one
        two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should wrap a long line", () => {
      const one = logger.info("this is a long line that should wrap appropriately")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        this is a long
        line that should
        wrap appropriately
        two
      `)
      expect(writer["contentHeight"]).to.equal(4)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(3)
    })

    it("should wrap a nested long line with appropriate indent", () => {
      const one = logger.info("one")
      const two = one.info("this is a long line that should wrap appropriately")

      expect(getStrippedContent()).to.eql(dedent`
        one
           this is a long
           line that
           should wrap
           appropriately
      `)
      expect(writer["contentHeight"]).to.equal(5)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should wrap a long line with color code", () => {
      const one = logger.info("this is a long line that " + chalk.white.bold("should wrap appropriately"))
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        this is a long
        line that should
        wrap appropriately
        two
      `)
      expect(writer["contentHeight"]).to.equal(4)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(3)
    })

    it("should ignore an entry with a level above writer level", () => {
      const one = logger.info("one")
      const two = logger.debug("two")

      expect(getStrippedContent()).to.eql(dedent`
        one
      `)
      expect(writer["contentHeight"]).to.equal(1)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key]).to.not.exist
    })

    it("should write a nested key even if its parent is hidden", () => {
      const one = logger.info("one")
      const two = logger.debug("two")
      const three = two.info("three")

      expect(getStrippedContent()).to.eql(dedent`
        one
           three
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key]).to.not.exist
      expect(writer["terminalEntries"][three.key].lineNumber).to.equal(1)
    })

    it("should insert an entry", () => {
      const one = logger.info("one")
      const oneChild = one.info("one-child")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        one
           one-child
        two
      `)
      expect(writer["contentHeight"]).to.equal(3)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][oneChild.key].lineNumber).to.equal(1)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(2)
    })

    it("should insert an entry after a nested entry", () => {
      const one = logger.info("one")
      const two = logger.info("two")
      const oneChild = one.info("one-child")
      const oneChild2 = one.info("one-child2")

      expect(getStrippedContent()).to.eql(dedent`
        one
           one-child
           one-child2
        two
      `)
      expect(writer["contentHeight"]).to.equal(4)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][oneChild.key].lineNumber).to.equal(1)
      expect(writer["terminalEntries"][oneChild2.key].lineNumber).to.equal(2)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(3)
    })

    it("should insert a nested entry", () => {
      const one = logger.info("one")
      const two = logger.info("two")
      const oneChild = one.info("one-child")
      const oneNested = oneChild.info("one-nested")

      expect(getStrippedContent()).to.eql(dedent`
        one
           one-child
              one-nested
        two
      `)
      expect(writer["contentHeight"]).to.equal(4)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][oneChild.key].lineNumber).to.equal(1)
      expect(writer["terminalEntries"][oneNested.key].lineNumber).to.equal(2)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(3)
    })

    it("should render a blank entry", () => {
      const one = logger.info("one")
      const two = logger.info("")
      const three = logger.info("three")

      expect(getStrippedContent()).to.equal("one\n \nthree")
      expect(writer["contentHeight"]).to.equal(3)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
      expect(writer["terminalEntries"][three.key].lineNumber).to.equal(2)
    })

    it("should insert a blank entry", () => {
      const one = logger.info("one")
      const oneChild = one.info("")
      const two = logger.info("two")

      expect(getStrippedContent()).to.equal("one\n \ntwo")
      expect(writer["contentHeight"]).to.equal(3)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][oneChild.key].lineNumber).to.equal(1)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(2)
    })

    it("should replace a placeholder", () => {
      const one = logger.placeholder()
      const two = logger.info("two")
      one.setState("one")

      expect(getStrippedContent()).to.eql(dedent`
        one
        two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should modify an entry in-place", () => {
      const one = logger.info("one")
      one.setState("one-b")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        one-b
        two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should extend an entry with a taller one", () => {
      const one = logger.info("one")
      one.setState("one\none-b")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        one
        one-b
        two
      `)
      expect(writer["contentHeight"]).to.equal(3)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(2)
    })

    it("should shorten an entry", () => {
      const one = logger.info("one\none-b")
      one.setState("one")
      const two = logger.info("two")

      expect(getStrippedContent()).to.eql(dedent`
        one
        two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should insert an entry with a spinner", () => {
      const one = logger.info("one")
      const two = logger.info({ status: "active", msg: "two" })

      expect(getStrippedContent()).to.eql(dedent`
        one
        ⠙ two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })

    it("should spin a spinner", () => {
      const one = logger.info("one")
      const two = logger.info({ status: "active", msg: "two" })

      writer["spin"]()

      expect(getStrippedContent()).to.eql(dedent`
        one
        ⠹ two
      `)
      expect(writer["contentHeight"]).to.equal(2)
      expect(writer["terminalEntries"][one.key].lineNumber).to.equal(0)
      expect(writer["terminalEntries"][two.key].lineNumber).to.equal(1)
    })
  })

  describe("getVisibleRange", () => {
    it("should get the visible range when logs are within a page", () => {
      logger.info("one")
      logger.info("two")

      const [from, to] = writer.getVisibleRange()

      expect(from).to.equal(0)
      expect(to).to.equal(2)
    })

    it("should get the visible range when logs are longer than a page", () => {
      for (let i = 0; i < height * 2; i++) {
        logger.info("line " + i)
      }

      const [from, to] = writer.getVisibleRange()

      expect(from).to.equal(height - 1)
      expect(to).to.equal(height * 2 - 1)
    })
  })
})

class MockStdout extends Writable {
  private _data: Array<any> = []

  // Adding padding
  columns = width + 2
  rows = height + 2

  constructor(options?: WritableOptions) {
    super(options)
  }

  // tslint:disable-next-line: function-name
  public _write(data: Buffer | string, encoding: string, callback: Function) {
    this.emit("data", Buffer.isBuffer(data) ? data.toString("utf8" || encoding) : data)
    callback()
  }

  public end(): void {
    this.emit("end")
    super.end()
  }

  public write(data: any): boolean {
    this._data.push(data)
    return super.write(data)
  }

  public data(): Array<any> {
    return this._data.slice(0)
  }
}
