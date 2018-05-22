/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird = require("bluebird")
import { readFile } from "fs-extra"
import * as pty from "node-pty"
import * as exitHook from "async-exit-hook"
import * as ignore from "ignore/ignore"
import * as klaw from "klaw"
import * as yaml from "js-yaml"
import * as Cryo from "cryo"
import * as inquirer from "inquirer"
import { spawn as _spawn } from "child_process"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { find } from "lodash"
import { getLogger, RootLogNode } from "../logger/index"
import {
  TimeoutError,
  GardenError,
} from "../exceptions"
import { PassThrough } from "stream"
import { isArray, isPlainObject, extend, mapValues, pickBy } from "lodash"
import highlight from "cli-highlight"
import chalk from "chalk"
import { FancyConsoleWriter } from "../logger/writers"
import hasAnsi = require("has-ansi")

// shim to allow async generator functions
(<any>Symbol).asyncIterator = (<any>Symbol).asyncIterator || Symbol.for("Symbol.asyncIterator")

export type HookCallback = (callback?: () => void) => void

const exitHookNames: string[] = [] // For debugging/testing/inspection purposes

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
export type Diff<T, U> = T extends U ? never : T
export type Nullable<T> = { [P in keyof T]: T[P] | null }

export function shutdown(code) {
  // This is a good place to log exitHookNames if needed.
  process.exit(code)
}

export class RsyncError extends GardenError {
  type = "rsync"
}

export type RsyncStdIOCallback = () => void

export type RsyncErrorCallback = (error: Error, code: string, cmd: string) => void

// Note: Rsync instances from the rsync npm module fit this interface.
export interface RsyncCommand {
  execute: (
    errorCallback: RsyncErrorCallback,
    stdoutHandler?: RsyncErrorCallback,
    stderrHandler?: RsyncErrorCallback,
  ) => void
}

export function execRsyncCmd(rsyncCmd: RsyncCommand, stdoutHandler?: RsyncStdIOCallback,
  stderrHandler?: RsyncStdIOCallback): Bluebird<any> {

  return new Bluebird((resolve, reject) => {
    rsyncCmd.execute((error: Error, code: string, cmd: string) => {
      if (!error) {
        resolve()
      } else {
        reject(new RsyncError(`Unable to sync files`, {
          error,
          code,
          cmd,
        }))
      }
    }, stdoutHandler, stderrHandler)
  })

}

export function registerCleanupFunction(name: string, func: HookCallback) {
  exitHookNames.push(name)
  exitHook(func)
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
      resolver()
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
  const gardenignorePath = join(rootPath, ".gardenignore")
  const ig = ignore()

  if (existsSync(gitignorePath)) {
    ig.add(readFileSync(gitignorePath).toString())
  }

  if (existsSync(gardenignorePath)) {
    ig.add(readFileSync(gardenignorePath).toString())
  }

  // should we be adding this (or more) by default?
  ig.add("node_modules")
  ig.add(".garden")

  return ig
}

export async function sleep(msec) {
  return new Promise(resolve => setTimeout(resolve, msec))
}

export interface SpawnParams {
  timeout?: number
  cwd?: string
  data?: Buffer
  ignoreError?: boolean
}

export interface SpawnPtyParams extends SpawnParams {
  silent?: boolean
  tty?: boolean
  bufferOutput?: boolean
}

export interface SpawnOutput {
  code: number
  output: string
  stdout?: string
  stderr?: string
  proc: any
}

export function spawn(
  cmd: string, args: string[],
  { timeout = 0, cwd, data, ignoreError = false }: SpawnParams = {},
) {
  const proc = _spawn(cmd, args, { cwd })

  const result: SpawnOutput = {
    code: 0,
    output: "",
    stdout: "",
    stderr: "",
    proc,
  }

  proc.stdout.on("data", (s) => {
    result.output += s
    result.stdout! += s
  })

  proc.stderr.on("data", (s) => {
    result.output += s
    result.stderr! += s
  })

  if (data) {
    proc.stdin.end(data)
  }

  return new Promise<SpawnOutput>((resolve, reject) => {
    let _timeout

    const _reject = (msg: string) => {
      const err = new Error(msg)
      extend(err, <any>result)
      reject(err)
    }

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        _reject(`kubectl timed out after ${timeout} seconds.`)
      }, timeout * 1000)
    }

    proc.on("close", (code) => {
      _timeout && clearTimeout(_timeout)
      result.code = code

      if (code === 0 || ignoreError) {
        resolve(result)
      } else {
        _reject("Process exited with code " + code)
      }
    })
  })
}

export function spawnPty(
  cmd: string, args: string[],
  {
    silent = false, tty = false, timeout = 0, cwd,
    bufferOutput = true, data, ignoreError = false,
  }: SpawnPtyParams = {},
): Bluebird<any> {

  let _process = <any>process

  let proc: any = pty.spawn(cmd, args, {
    cwd,
    name: "xterm-color",
    cols: _process.stdout.columns,
    rows: _process.stdout.rows,
  })

  _process.stdin.setEncoding("utf8")

  // raw mode is not available if we're running without a TTY
  tty && _process.stdin.setRawMode && _process.stdin.setRawMode(true)

  const result: SpawnOutput = {
    code: 0,
    output: "",
    proc,
  }

  proc.on("data", (output) => {
    const str = output.toString()

    if (bufferOutput) {
      result.output += str
    }

    if (!silent) {
      process.stdout.write(hasAnsi(str) ? str : chalk.white(str))
    }
  })

  if (data) {
    const bufferStream = new PassThrough()
    bufferStream.end(data + "\n\0")
    bufferStream.pipe(proc)
    proc.end()
  }

  if (tty) {
    process.stdin.pipe(proc)
  }

  return new Bluebird((resolve, _reject) => {
    let _timeout

    const reject = (err: any) => {
      err.output = result.output
      err.proc = result.proc
      console.log(err.output)
      _reject(err)
    }

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        const err = new TimeoutError(`${cmd} command timed out after ${timeout} seconds.`, { cmd, timeout })
        reject(err)
      }, timeout * 1000)
    }

    proc.on("exit", (code) => {
      _timeout && clearTimeout(_timeout)

      // make sure raw input is decoupled
      tty && _process.stdin.setRawMode && _process.stdin.setRawMode(false)
      result.code = code

      if (code === 0 || ignoreError) {
        resolve(result)
      } else {
        const err: any = new Error("Process exited with code " + code)
        err.code = code
        reject(err)
      }
    })
  })
}

export async function prompt(config: inquirer.Question, logger?: RootLogNode): Promise<object> {
  const _logger = logger || getLogger()
  const fancyWriter = _logger.writers.find(w => w instanceof FancyConsoleWriter) as (FancyConsoleWriter | undefined)
  // Remove when https://github.com/garden-io/garden/issues/79 is solved
  if (fancyWriter) {
    fancyWriter.stopAndPersist(_logger)
  }
  return inquirer.prompt(config)
}

export function dumpYaml(yamlPath, data) {
  writeFileSync(yamlPath, yaml.safeDump(data, { noRefs: true }))
}

/**
 * Splits the input string on the first occurrence of `delimiter`.
 */
export function splitFirst(s: string, delimiter: string) {
  const parts = s.split(delimiter)
  return [parts[0], parts.slice(1).join(delimiter)]
}

/**
 * Recursively resolves all promises in the given input,
 * walking through all object keys and array items.
 *
 * @param v: T
 * @returns {Promise<T>}
 */
export async function deepResolve<T>(v: T) {
  if (isArray(v)) {
    return await Bluebird.map(v, deepResolve)
  } else if (isPlainObject(v)) {
    return await Bluebird.props(mapValues(v, deepResolve))
  } else {
    return Promise.resolve(v)
  }
}

export function omitUndefined(o: object) {
  return pickBy(o, (v: any) => v !== undefined)
}

export function serializeObject(o: object) {
  return Buffer.from(Cryo.stringify(o)).toString("base64")
}

export function deserializeObject(s: string) {
  return Cryo.parse(Buffer.from(s, "base64"))
}

export function serializeKeys(o: object) {
  return mapValues(o, serializeObject)
}

export function deserializeKeys(o: object) {
  return mapValues(o, deserializeObject)
}

export const enumToArray = Enum => (
  Object.values(Enum).filter(k => typeof k === "string") as string[]
)

export function highlightYaml(s: string) {
  return highlight(s, {
    language: "yaml",
    theme: {
      keyword: chalk.white.italic,
      literal: chalk.white.italic,
      string: chalk.white,
    },
  })
}

export async function loadYamlFile(path: string): Promise<any> {
  const fileData = await readFile(path)
  return yaml.safeLoad(fileData.toString())
}

export interface ObjectWithName {
  name: string
}

export function getNames<T extends ObjectWithName>(array: T[]) {
  return array.map(v => v.name)
}

export function findByName<T extends ObjectWithName>(array: T[], name: string): T | undefined {
  return find(array, ["name", name])
}
