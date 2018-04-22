import { LoggerType } from "../src/logger/types"
import { setDefaultLoggerType } from "../src/logger"

// Global before hooks
before(() => {
  setDefaultLoggerType(LoggerType.quiet)
})
