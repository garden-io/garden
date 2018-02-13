import { LogLevel, LoggerType } from "../src/logger/types"
import { setDefaultLogLevel, setDefaultLoggerType } from "../src/logger"

setDefaultLogLevel(LogLevel.error)
setDefaultLoggerType(LoggerType.basic)
