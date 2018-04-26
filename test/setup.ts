import { LoggerType } from "../src/logger/types"
import { setLoggerType, getLogger } from "../src/logger"

// Global before hooks
before(() => {
  setLoggerType(LoggerType.quiet)
})
