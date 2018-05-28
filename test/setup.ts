import * as td from "testdouble"
import { LogLevel } from "../src/logger/types"
import { RootLogNode } from "../src/logger"
import { Module } from "../src/types/module"

// Global before hooks
beforeEach(() => {
  td.replace(Module.prototype, "getVersion", () => ({
    versionString: "0000000000",
    latestCommit: "0000000000",
    dirtyTimestamp: null,
  }))
})

afterEach(() => td.reset())
