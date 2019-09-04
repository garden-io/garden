import { expect } from "chai"
import chalk from "chalk"
import stripAnsi from "strip-ansi"

import { LogLevel } from "../../../../../src/logger/log-node"
import { getLogger } from "../../../../../src/logger/logger"
import { renderError } from "../../../../../src/logger/renderers"
import { render } from "../../../../../src/logger/writers/file-writer"

const logger: any = getLogger()

beforeEach(() => {
  logger.children = []
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
