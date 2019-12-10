import td from "testdouble"
import timekeeper from "timekeeper"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
  })
} catch (_) {}

beforeEach(() => {})
afterEach(() => {
  td.reset()
  timekeeper.reset()
})
