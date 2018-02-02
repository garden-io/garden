import Bluebird = require("bluebird")
import * as pty from "node-pty"
import * as exitHook from "async-exit-hook"
import * as ignore from "ignore/ignore"
import * as klaw from "klaw"
import * as yaml from "js-yaml"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { getLogger } from "./log"
import { TimeoutError } from "./exceptions"
import { PassThrough } from "stream"

// shim to allow async generator functions
(<any>Symbol).asyncIterator = (<any>Symbol).asyncIterator || Symbol.for("Symbol.asyncIterator")

type HookCallback = (callback?: () => void) => void

const exitHooks: HookCallback[] = []

export type Nullable<T> = {[P in keyof T]: T[P] | null }

export function shutdown(code) {
  if (exitHooks.length > 1) {
    const signal = code === 0 ? "beforeExit" : "exitWithError"
    process.emit(<NodeJS.Signals>signal)
  } else {
    process.exit(code)
  }
}

export function registerCleanupFunction(name: string, func: HookCallback) {
  // NOTE: this currently does not work on SIGINT in ts-node due to a bug
  // (see https://github.com/TypeStrong/ts-node/pull/458)

  const log = getLogger()

  if (exitHooks.length === 0) {
    exitHook.hookEvent("exitWithError", 1)

    const firstHook = () => {
      log.debug("cleanup", "Starting cleanup...")
    }

    exitHook(firstHook)
    exitHooks.push(firstHook)
  }

  const hook = (callback) => {
    if (func.length === 0) {
      log.debug("cleanup", name)
      func()
    } else {
      log.debug("cleanup", `Starting ${name}`)
      func(() => {
        log.debug("cleanup", `Completed ${name}`)
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

export async function sleep(msec) {
  return new Promise(resolve => setTimeout(resolve, msec))
}

interface SpawnPtyParams {
  silent?: boolean
  tty?: boolean
  timeout?: number
  cwd?: string
  bufferOutput?: boolean
  data?: Buffer
}

interface SpawnPtyOutput {
  code: number
  output: string
  term: any
}

export function spawnPty(
  cmd: string, args: string[],
  { silent = false, tty = false, timeout = 0, cwd, bufferOutput = true, data }: SpawnPtyParams = {},
): Bluebird<any> {

  let _process = <any>process

  let term: any = pty.spawn(cmd, args, {
    cwd,
    name: "xterm-color",
    cols: _process.stdout.columns,
    rows: _process.stdout.rows,
  })

  _process.stdin.setEncoding("utf8")

  // raw mode is not available if we're running without a TTY
  tty && _process.stdin.setRawMode && _process.stdin.setRawMode(true)

  const result: SpawnPtyOutput = {
    code: 0,
    output: "",
    term,
  }

  term.on("data", (output) => {
    if (bufferOutput) {
      result.output += output.toString()
    }

    if (!silent) {
      process.stdout.write(output)
    }
  })

  if (data) {
    const bufferStream = new PassThrough()
    bufferStream.end(data + "\n\0")
    bufferStream.pipe(term)
    term.end()
  }

  if (tty) {
    process.stdin.pipe(term)
  }

  return new Bluebird((resolve, _reject) => {
    let _timeout

    const reject = (err: any) => {
      err.output = result.output
      err.term = result.term
      console.log(err.output)
      _reject(err)
    }

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        term.kill("SIGKILL")
        const err = new TimeoutError(`${cmd} command timed out after ${timeout} seconds.`, { cmd, timeout })
        reject(err)
      }, timeout * 1000)
    }

    term.on("exit", (code) => {
      _timeout && clearTimeout(_timeout)

      // make sure raw input is decoupled
      tty && _process.stdin.setRawMode && _process.stdin.setRawMode(false)
      result.code = code

      if (code === 0) {
        resolve(result)
      } else {
        const err: any = new Error("Process exited with code " + code)
        err.code = code
        reject(err)
      }
    })
  })
}

export function dumpYaml(yamlPath, data) {
  writeFileSync(yamlPath, yaml.safeDump(data, { noRefs: true }))
}
