import * as td from "testdouble"
import { Module } from "../src/types/module"
import { RootLogNode } from "../src/logger/logger"
import { LogLevel } from "../src/logger/types"

// make sure logger is initialized
try {
  RootLogNode.initialize({ level: LogLevel.info })
} catch (_) { }

// Global hooks
beforeEach(() => { })
afterEach(() => td.reset())
