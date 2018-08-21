import * as td from "testdouble"
import { RootLogNode } from "../src/logger/logger"
import { LogLevel } from "../src/logger/types"
import { makeTestGardenA } from "./helpers"

// make sure logger is initialized
try {
  RootLogNode.initialize({ level: LogLevel.info })
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
