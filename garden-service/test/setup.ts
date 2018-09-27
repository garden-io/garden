import * as td from "testdouble"
import { Logger } from "../src/logger/logger"
import { LogLevel } from "../src/logger/log-node"
import { makeTestGardenA } from "./helpers"

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) { }

// Global hooks
before(async function(this: any) {
  // tslint:disable-next-line:no-invalid-this
  this.timeout(10000)

  // doing this to make sure ts-node completes compilation before running tests
  await makeTestGardenA()
})

beforeEach(() => { })
afterEach(() => td.reset())
