import * as exitHook from "async-exit-hook"
import * as ignore from "ignore/ignore"
import * as klaw from "klaw"
import { log } from "./log"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { LoggerInstance, Logger, transports } from "winston"

// shim to allow async generator functions
(<any>Symbol).asyncIterator = (<any>Symbol).asyncIterator || Symbol.for("Symbol.asyncIterator")

type HookCallback = (callback?: () => void) => void

const exitHooks: HookCallback[] = []
let logger: LoggerInstance

export function shutdown(code) {
  if (exitHooks.length > 1) {
    const signal = code === 0 ? "beforeExit" : "exitWithError"
    process.emit(<NodeJS.Signals>signal)
  } else {
    process.exit(code)
  }
}

// TODO: make log level configurable
export function getLogger(level = "info") {
  if (!logger) {
    logger = new Logger({
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

  return logger
}

export function registerCleanupFunction(name: string, func: HookCallback) {
  // NOTE: this currently does not work on SIGINT in ts-node due to a bug
  // (see https://github.com/TypeStrong/ts-node/pull/458)

  if (exitHooks.length === 0) {
    exitHook.hookEvent("exitWithError", 1)

    const firstHook = () => {
      log("cleanup", "Starting cleanup...")
    }

    exitHook(firstHook)
    exitHooks.push(firstHook)
  }

  const hook = (callback) => {
    if (func.length === 0) {
      log("cleanup", name)
      func()
    } else {
      log("cleanup", `Starting ${name}`)
      func(() => {
        log("cleanup", `Completed ${name}`)
        callback()
      })
    }
  }

  exitHook(hook)
  exitHooks.push(hook)
}

export async function* scanDirectory(path: string, opts?: klaw.Options): AsyncIterableIterator<klaw.Item> {
  let done = false
  let resolver
  let rejecter

  klaw(path, opts)
    .on("data", (item) => {
      if (item.path !== path) {
        resolver(item)
      }
    })
    .on("error", (err) => {
      rejecter(err)
    })
    .on("end", () => {
      done = true
    })

  // a nice little trick to turn the stream into an async generator
  while (!done) {
    const promise: Promise<klaw.Item> = new Promise((resolve, reject) => {
      resolver = resolve
      rejecter = reject
    })

    yield await promise
  }
}

export function getIgnorer(rootPath: string) {
  // TODO: this doesn't handle nested .gitignore files, we should revisit
  const gitignorePath = join(rootPath, ".gitignore")
  const ig = ignore()

  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath).toString())
  }

  // should we be adding this (or more) by default?
  ig.add("node_modules")

  return ig
}
