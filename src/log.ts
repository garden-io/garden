// TODO: make log level configurable
import { Logger as WinstonLogger, LoggerInstance, transports } from "winston"
import { padEnd } from "lodash"
import chalk from "chalk"

const sectionPrefixWidth = 20
const sectionStyle = (s: string) => chalk.italic(s)
const defaultLogLevel = "verbose"

let logger: Logger

/*
  Wrapper around Winston logger, to configure to our needs and to add section argument to log method signatures.
 */
export class Logger {
  private winston: LoggerInstance

  constructor(level: string) {
    this.winston = new WinstonLogger({
      level,
      exitOnError: false,
      transports: [
        new transports.Console({
          showLevel: false,
          handleExceptions: true,
          humanReadableUnhandledException: true,
        }),
      ],
    })
  }

  log(level: string, section: string, msg: string, ...meta: any[]) {
    let prefix = ""

    if (!msg) {
      msg = section
    } else {
      prefix = sectionStyle(`[${padEnd(section, sectionPrefixWidth)}] `)
    }

    return this.winston.log(level, prefix + msg, ...meta)
  }

  silly(section: string, msg: string, ...meta: any[]) {
    return this.log("silly", section, msg, ...meta)
  }

  debug(section: string, msg: string, ...meta: any[]) {
    return this.log("debug", section, msg, ...meta)
  }

  verbose(section: string, msg: string, ...meta: any[]) {
    return this.log("verbose", section, msg, ...meta)
  }

  info(section: string, msg: string, ...meta: any[]) {
    return this.log("info", section, msg, ...meta)
  }

  warn(section: string, msg: string, ...meta: any[]) {
    return this.log("warn", section, msg, ...meta)
  }

  error(section: string, msg: string, ...meta: any[]) {
    return this.log("error", section, msg, ...meta)
  }
}

export function getLogger(level = defaultLogLevel) {
  if (!logger) {
    logger = new Logger(level)
  }

  return logger
}

export function logException(error: Error) {
  console.error((error.stack && error.stack.red) || (error.toString().red))
}
