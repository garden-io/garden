import * as td from "testdouble"
import { LoggerType } from "../src/logger/types"
import { setLoggerType } from "../src/logger"
import { Module } from "../src/types/module"

// Global before hooks
before(() => {
  setLoggerType(LoggerType.quiet)
})

beforeEach(() => {
  td.replace(Module.prototype, "getVersion", () => ({
    versionString: "0000000000",
    latestCommit: "0000000000",
    dirtyTimestamp: null,
  }))
})

afterEach(() => td.reset())
