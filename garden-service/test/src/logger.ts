import { expect } from "chai"
import chalk from "chalk"
import * as stripAnsi from "strip-ansi"

import { LogLevel } from "../../src/logger/log-node"
import { BasicTerminalWriter } from "../../src/logger/writers/basic-terminal-writer"
import { FancyTerminalWriter } from "../../src/logger/writers/fancy-terminal-writer"
import { getLogger } from "../../src/logger/logger"
import { getChildNodes } from "../../src/logger/util"
import {
  renderMsg,
  msgStyle,
  errorStyle,
  formatForTerminal,
  renderError,
} from "../../src/logger/renderers"
import { render } from "../../src/logger/writers/file-writer"

const logger = getLogger()

beforeEach(() => {
  (<any>logger).children = []
})

describe("LogNode", () => {

  describe("findById", () => {
    it("should return the first log entry with a matching id and undefined otherwise", () => {
      logger.info({ msg: "0" })
      logger.info({ msg: "a1", id: "a" })
      logger.info({ msg: "a2", id: "a" })
      expect(logger.findById("a")["opts"]["msg"]).to.eql("a1")
      expect(logger.findById("z")).to.be.undefined
    })
  })

  describe("filterBySection", () => {
    it("should return an array of all entries with the matching section name", () => {
      logger.info({ section: "s0" })
      logger.info({ section: "s1", id: "a" })
      logger.info({ section: "s2" })
      logger.info({ section: "s1", id: "b" })
      const s1 = logger.filterBySection("s1")
      const sEmpty = logger.filterBySection("s99")
      expect(s1.map(entry => entry.id)).to.eql(["a", "b"])
      expect(sEmpty).to.eql([])
    })
  })

  describe("appendNode", () => {
    it("should add new child entries to the respective node", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const prevLength = logger.children.length
      const entry = logger.children[0]
      const nested = entry.info("nested")
      const deepNested = nested.info("deep")

      expect(logger.children[0].children).to.have.lengthOf(1)
      expect(logger.children[0].children[0]).to.eql(nested)
      expect(logger.children[0].children[0].children[0]).to.eql(deepNested)
      expect(logger.children).to.have.lengthOf(prevLength)
    })
  })

})

describe("RootLogNode", () => {
  describe("getLogEntries", () => {
    it("should return an ordered list of log entries", () => {
      logger.error("error")
      logger.warn("warn")
      logger.info("info")
      logger.verbose("verbose")
      logger.debug("debug")
      logger.silly("silly")

      const entries = logger.getLogEntries()
      const levels = entries.map(e => e.level)

      expect(entries).to.have.lengthOf(6)
      expect(levels).to.eql([
        LogLevel.error,
        LogLevel.warn,
        LogLevel.info,
        LogLevel.verbose,
        LogLevel.debug,
        LogLevel.silly,
      ])
    })
  })

})

describe("Writers", () => {
  describe("BasicTerminalWriter", () => {
    describe("render", () => {
      it("should return a formatted message if level is geq than entry level", () => {
        const writer = new BasicTerminalWriter()
        const entry = logger.info("hello logger")
        const out = writer.render(entry, logger)
        expect(out).to.eql(formatForTerminal(entry))
      })
      it("should return a new line if message is an empty string", () => {
        const writer = new BasicTerminalWriter()
        const entry = logger.info("")
        const out = writer.render(entry, logger)
        expect(out).to.eql("\n")
      })
      it("should return null if entry level is geq to writer level", () => {
        const writer = new BasicTerminalWriter()
        const entry = logger.verbose("abc")
        const out = writer.render(entry, logger)
        expect(out).to.eql(null)
      })
      it("should override root level if level is set", () => {
        const writer = new BasicTerminalWriter({ level: LogLevel.verbose })
        const entry = logger.verbose("")
        const out = writer.render(entry, logger)
        expect(out).to.eql("\n")
      })
      it("should return an empty string if entry is empty", () => {
        const writer = new BasicTerminalWriter()
        const entry = logger.placeholder()
        const out = writer.render(entry, logger)
        expect(out).to.eql("")
      })
    })
  })

  describe("FancyTerminalWriter", () => {
    describe("toTerminalEntries", () => {
      const writer = new FancyTerminalWriter()
      const verboseWriter = new FancyTerminalWriter({ level: LogLevel.verbose })
      writer.stop()
      verboseWriter.stop()
      it("should map a LogNode into an array of entries with line numbers and spinner positions", () => {
        logger.info("1 line") // 0
        logger.info("2 lines\n") // 1
        logger.info("1 line") // 3
        logger.info("3 lines\n\n") // 4
        const spinner = logger.info({ msg: "spinner", status: "active" }) // 7
        spinner.info({ msg: "nested spinner", status: "active" }) // 8
        const terminalEntries = writer.toTerminalEntries(logger)
        const lineNumbers = terminalEntries.map(e => e.lineNumber)
        const spinners = terminalEntries.filter(e => !!e.spinnerCoords).map(e => e.spinnerCoords)
        expect(lineNumbers).to.eql([0, 1, 3, 4, 7, 8])
        expect(spinners).to.eql([[0, 7], [3, 8]])
      })
      it("should override root level if level is set", () => {
        const entry = logger.verbose("")
        const terminalEntries = verboseWriter.toTerminalEntries(logger)
        expect(terminalEntries[0].key).to.eql(entry.key)
      })
      it("should skip entry if entry level is geq to writer level", () => {
        logger.verbose("")
        const terminalEntries = writer.toTerminalEntries(logger)
        expect(terminalEntries).to.eql([])
      })
      it("should skip entry if entry is empty", () => {
        logger.placeholder()
        const terminalEntries = writer.toTerminalEntries(logger)
        expect(terminalEntries).to.eql([])
      })
    })
  })

  describe("FileWriter", () => {
    describe("render", () => {
      it("should render message without ansi characters", () => {
        const entry = logger.info(chalk.red("hello"))
        expect(render(LogLevel.info, entry)).to.equal("hello")
      })
      it("should render error message if entry level is error", () => {
        const entry = logger.error("error")
        const expectedOutput = stripAnsi(renderError(entry))
        expect(render(LogLevel.info, entry)).to.equal(expectedOutput)
      })
      it("should return null if entry level is geq to writer level", () => {
        const entry = logger.silly("silly")
        expect(render(LogLevel.info, entry)).to.equal(null)
      })
    })
  })
})

describe("LogEntry", () => {
  it("should dedent placeholder log entries", () => {
    const ph1 = logger.placeholder()
    const ph2 = ph1.placeholder()
    const nonEmpty = ph1.info("foo")
    const nested = nonEmpty.info("foo")
    const nestedPh = nested.placeholder()
    const indents = [
      ph1.opts.indent,
      ph2.opts.indent,
      nonEmpty.opts.indent,
      nested.opts.indent,
      nestedPh.opts.indent,
    ]
    expect(indents).to.eql([-1, -1, 0, 1, 0])
  })
  it("should indent nested log entries", () => {
    const entry = logger.info("hello")
    const nested = entry.info("nested")
    const deepNested = nested.info("deep nested")
    const deepDeepNested = deepNested.info("deep deep inside")
    const deepDeepPh = deepDeepNested.placeholder()
    const deepDeepNested2 = deepDeepPh.info("")
    const indents = [
      entry.opts.indent,
      nested.opts.indent,
      deepNested.opts.indent,
      deepDeepNested.opts.indent,
      deepDeepPh.opts.indent,
      deepDeepNested2.opts.indent,
    ]
    expect(indents).to.eql([undefined, 1, 2, 3, 2, 3])
  })
  it("should create a log entry with level geq to its parent", () => {
    const verbose = logger.verbose("")
    const levels = [
      verbose.error("").level,
      verbose.warn("").level,
      verbose.info("").level,
      verbose.verbose("").level,
      verbose.debug("").level,
      verbose.silly("").level,
    ]
    expect(levels).to.eql([3, 3, 3, 3, 4, 5])
  })
  describe("setState", () => {
    it("should update entry state and optionally append new msg to previous msg", () => {
      const entry = logger.info("")
      entry.setState("new")
      expect(entry.opts.msg).to.equal("new")
      entry.setState({ msg: "new2", append: true })
      expect(entry.opts.msg).to.eql(["new", "new2"])
    })
  })
  describe("setState", () => {
    it("should preserve status", () => {
      const entry = logger.info("")
      entry.setSuccess()
      entry.setState("change text")
      expect(entry.opts.status).to.equal("success")
    })
  })
  describe("setDone", () => {
    it("should update entry state and set status to done", () => {
      const entry = logger.info("")
      entry.setDone()
      expect(entry.opts.status).to.equal("done")
    })
  })
  describe("setSuccess", () => {
    it("should update entry state and set status and symbol to success", () => {
      const entry = logger.info("")
      entry.setSuccess()
      expect(entry.opts.status).to.equal("success")
      expect(entry.opts.symbol).to.equal("success")
    })
  })
  describe("setError", () => {
    it("should update entry state and set status and symbol to error", () => {
      const entry = logger.info("")
      entry.setError()
      expect(entry.opts.status).to.equal("error")
      expect(entry.opts.symbol).to.equal("error")
    })
  })
  describe("setWarn", () => {
    it("should update entry state and set status and symbol to warn", () => {
      const entry = logger.info("")
      entry.setWarn()
      expect(entry.opts.status).to.equal("warn")
      expect(entry.opts.symbol).to.equal("warning")
    })
  })
})

describe("renderers", () => {
  describe("renderMsg", () => {
    it("should return an empty string if the entry is empty", () => {
      const entry = logger.placeholder()
      expect(renderMsg(entry)).to.equal("")
    })
    it("should render the message with the message style", () => {
      const entry = logger.info({ msg: "hello message" })
      expect(renderMsg(entry)).to.equal(msgStyle("hello message"))
    })
    it("should join an array of messages with an arrow symbol and render with the message style", () => {
      const entry = logger.info({ msg: ["message a", "message b"] })
      expect(renderMsg(entry)).to.equal(msgStyle("message a") + msgStyle(" → ") + msgStyle("message b"))
    })
    it("should render the message without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: "hello stream" })
      expect(renderMsg(entry)).to.equal("hello stream")
    })
    it("should join an array of messages and render without styles if the entry is from an intercepted stream", () => {
      const entry = logger.info({ fromStdStream: true, msg: ["stream a", "stream b"] })
      expect(renderMsg(entry)).to.equal("stream a stream b")
    })
    it("should render the message with the error style if the entry has error status", () => {
      const entry = logger.info({ msg: "hello error", status: "error" })
      expect(renderMsg(entry)).to.equal(errorStyle("hello error"))
    })
    it("should join an array of messages with an arrow symbol and render with the error style" +
      " if the entry has error status", () => {
        const entry = logger.info({ msg: ["error a", "error b"], status: "error" })
        expect(renderMsg(entry)).to.equal(errorStyle("error a") + errorStyle(" → ") + errorStyle("error b"))
      })
  })
  describe("formatForTerminal", () => {
    it("should return the entry as a formatted string with a new line character", () => {
      const entry = logger.info("")
      expect(formatForTerminal(entry)).to.equal("\n")
    })
    it("should return an empty string without a new line if the entry is empty", () => {
      const entry = logger.placeholder()
      expect(formatForTerminal(entry)).to.equal("")
    })
  })
})

describe("util", () => {
  describe("getChildNodes", () => {
    it("should convert an n-ary tree into an ordered list of child nodes (skipping the root)", () => {
      interface TestNode {
        children: any[]
        id: number
      }
      const graph = {
        children: [
          {
            children: [
              {
                children: [
                  { children: [], id: 3 },
                ],
                id: 2,
              },
              { children: [], id: 4 },
              { children: [], id: 5 },
            ],
            id: 1,
          },
          {
            children: [

            ],
            id: 6,
          },
        ],
        id: 0,
      }
      const nodeList = getChildNodes<TestNode, TestNode>(graph)
      expect(nodeList.map(n => n.id)).to.eql([1, 2, 3, 4, 5, 6])
    })
  })
})
