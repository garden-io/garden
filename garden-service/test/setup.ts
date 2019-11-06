import td from "testdouble"
import timekeeper from "timekeeper"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"
import { makeTestGardenA } from "./helpers"
// import { BasicTerminalWriter } from "../src/logger/writers/basic-terminal-writer"

// make sure logger is initialized
try {
  Logger.initialize({
    level: LogLevel.info,
    // level: LogLevel.debug,
    // writers: [new BasicTerminalWriter()],
  })
} catch (_) {}

// Global hooks
before(async function(this: any) {
  // tslint:disable-next-line:no-invalid-this
  this.timeout(10000)

  // doing this to make sure ts-node completes compilation before running tests
  await makeTestGardenA()
})

beforeEach(() => {})
afterEach(() => {
  td.reset()
  timekeeper.reset()
})
