import * as td from "testdouble"
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
