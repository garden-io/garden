/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  difference,
  extend,
  find,
  fromPairs,
  groupBy,
  isArray,
  isPlainObject,
  mapValues,
  omit,
  pick,
  pickBy,
  range,
  some,
  trimEnd,
  uniqBy,
} from "lodash"
import { ResolvableProps } from "bluebird"
import exitHook from "async-exit-hook"
import Cryo from "cryo"
import _spawn from "cross-spawn"
import { readFile, writeFile } from "fs-extra"
import { GardenError, ParameterError, RuntimeError, TimeoutError } from "../exceptions"
import highlight from "cli-highlight"
import chalk from "chalk"
import { DumpOptions, safeDump, safeLoad } from "js-yaml"
import { createHash } from "crypto"
import { dedent, tailString } from "./string"
import { Readable, Writable } from "stream"
import { LogEntry } from "../logger/log-entry"
import { PrimitiveMap } from "../config/common"
import { isAbsolute, relative } from "path"
import { getDefaultProfiler } from "./profiling"
import { gardenEnv } from "../constants"
import { spawnSync } from "child_process"
import split2 = require("split2")
import Bluebird = require("bluebird")
import execa = require("execa")

export { v4 as uuidv4 } from "uuid"

export type HookCallback = (callback?: () => void) => void

const exitHookNames: string[] = [] // For debugging/testing/inspection purposes

// For creating a subset of a union type, see: https://stackoverflow.com/a/53637746
export type PickFromUnion<T, U extends T> = U
export type ValueOf<T> = T[keyof T]
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type Diff<T, U> = T extends U ? never : T
export type Mutable<T> = { -readonly [K in keyof T]: T[K] }
export type Nullable<T> = { [P in keyof T]: T[P] | null }
// From: https://stackoverflow.com/a/49936686/5629940
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[P] extends ReadonlyArray<infer V>
    ? ReadonlyArray<DeepPartial<V>>
    : DeepPartial<T[P]>
}
export type Unpacked<T> = T extends (infer U)[]
  ? U
  : T extends (...args: any[]) => infer V
  ? V
  : T extends Promise<infer W>
  ? W
  : T
export type ExcludesFalsy = <T>(x: T | false | null | undefined) => x is T

const MAX_BUFFER_SIZE = 1024 * 1024

// Used to control process-level operations during testing
export const testFlags = {
  disableShutdown: false,
}

export async function shutdown(code?: number) {
  // This is a good place to log exitHookNames if needed.
  if (!testFlags.disableShutdown) {
    if (gardenEnv.GARDEN_ENABLE_PROFILING) {
      // tslint:disable-next-line: no-console
      console.log(getDefaultProfiler().report())
    }
    process.exit(code)
  }
}

export function registerCleanupFunction(name: string, func: HookCallback) {
  exitHookNames.push(name)
  exitHook(func)
}

export function getPackageVersion(): string {
  const version = require("../../../package.json").version
  return version
}

/**
 * Returns "Garden Cloud" if domain matches https://<some-subdomain>.app.garden,
 * otherwise "Garden Enterprise".
 *
 * TODO: Return the distribution type from the API and store on the CloudApi class.
 */
export function getCloudDistributionName(domain: string) {
  if (!domain.match(/^https:\/\/.+\.app\.garden$/i)) {
    return "Garden Enterprise"
  }
  return "Garden Cloud"
}

export async function sleep(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec))
}

export function sleepSync(msec: number) {
  // it seems to be the best available solution to sleep synchronously, see https://stackoverflow.com/a/50098685/2753863
  spawnSync(process.argv[0], ["-e", "setTimeout(function(){}," + msec + ")"])
}

/**
 * Returns a promise that can be resolved/rejected by calling resolver/rejecter.
 */
export function defer<T>() {
  let outerResolve
  let outerReject
  const promise = new Promise<T>((res, rej) => {
    outerResolve = res
    outerReject = rej
  })

  return { promise, resolver: outerResolve, rejecter: outerReject }
}

/**
 * Extracting to a separate function so that we can test output streams
 */
export function renderOutputStream(msg: string) {
  return chalk.gray("  → " + msg)
}

/**
 * Creates an output stream that updates a log entry on data events (in an opinionated way).
 *
 * Note that new entries are not created but rather the passed log entry gets updated.
 * It's therefore recommended to pass a placeholder entry, for example: `log.placeholder(LogLevel.debug)`
 */
export function createOutputStream(log: LogEntry) {
  const outputStream = split2()

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    log.setState(renderOutputStream(line.toString()))
  })

  return outputStream
}

export function makeErrorMsg({
  code,
  cmd,
  args,
  output,
  error,
}: {
  code: number
  cmd: string
  args: string[]
  error: string
  output: string
}) {
  const nLinesToShow = 100
  const lines = output.split("\n")
  const out = lines.slice(-nLinesToShow).join("\n")
  const cmdStr = args.length > 0 ? `${cmd} ${args.join(" ")}` : cmd
  let msg = dedent`
    Command "${cmdStr}" failed with code ${code}:

    ${trimEnd(error, "\n")}
  `
  if (output && output !== error) {
    msg +=
      lines.length > nLinesToShow
        ? `\n\nHere are the last ${nLinesToShow} lines of the output:`
        : `\n\nHere's the full output:`
    msg += `\n\n${trimEnd(out, "\n")}`
  }
  return msg
}

export interface ExecOpts extends execa.Options {
  stdout?: Writable
  stderr?: Writable
}

/**
 * A wrapper function around execa that standardises error messages.
 * Enforces `buffer: true` (which is the default execa behavior).
 *
 * Also adds the ability to pipe stdout|stderr to an output stream.
 */
export async function exec(cmd: string, args: string[], opts: ExecOpts = {}) {
  // Ensure buffer is always set to true so that we can read the error output
  opts = { windowsHide: true, ...opts, buffer: true, all: true }
  const proc = execa(cmd, args, omit(opts, ["stdout", "stderr"]))

  opts.stdout && proc.stdout && proc.stdout.pipe(opts.stdout)
  opts.stderr && proc.stderr && proc.stderr.pipe(opts.stderr)

  try {
    const res = await proc
    return res
  } catch (err) {
    if (err.code === "EMFILE" || err.errno === "EMFILE") {
      throw new RuntimeError(
        dedent`
        Received EMFILE (Too many open files) error when running ${cmd}.

        This may mean there are too many files in the project, and that you need to exclude large dependency directories. Please see https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories for information on how to do that.

        This can also be due to limits on open file descriptors being too low. Here is one guide on how to configure those limits for different platforms: https://docs.riak.com/riak/kv/latest/using/performance/open-files-limit/index.html
        `,
        { error: err }
      )
    }

    const error = <execa.ExecaError>err
    const message = makeErrorMsg({
      cmd,
      args,
      code: error.exitCode || err.code || err.errno,
      output: error.all || error.stdout || error.stderr || "",
      error: error.stderr,
    })
    error.message = message
    throw error
  }
}

export interface SpawnOpts {
  timeoutSec?: number
  cwd?: string
  data?: Buffer
  ignoreError?: boolean
  env?: { [key: string]: string | undefined }
  rawMode?: boolean // Only used if tty = true. See also: https://nodejs.org/api/tty.html#tty_readstream_setrawmode_mode
  stdout?: Writable
  stderr?: Writable
  tty?: boolean
  wait?: boolean
}

export interface SpawnOutput {
  code: number
  all: string
  stdout: string
  stderr: string
  proc: any
}

// TODO Dump output to a log file if it exceeds the MAX_BUFFER_SIZE

/**
 * Note: For line-by-line stdout/stderr streaming, both `opts.stdout` and `opts.stderr` must be defined. This is a
 * result of how Node's child process spawning works (which this function wraps).
 */
export function spawn(cmd: string, args: string[], opts: SpawnOpts = {}) {
  const {
    timeoutSec: timeout = 0,
    cwd,
    data,
    ignoreError = false,
    env,
    rawMode = true,
    stdout,
    stderr,
    tty,
    wait = true,
  } = opts

  const stdio = tty ? "inherit" : "pipe"
  const proc = _spawn(cmd, args, { cwd, env, stdio, windowsHide: true })

  const result: SpawnOutput = {
    code: 0,
    all: "",
    stdout: "",
    stderr: "",
    proc,
  }

  let _process = <any>process

  if (tty) {
    if (data) {
      throw new ParameterError(`Cannot pipe to stdin when tty=true`, { cmd, args, opts })
    }
    _process.stdin.setEncoding("utf8")
    // raw mode is not available if we're running without a TTY
    if (rawMode) {
      _process.stdin.setRawMode && _process.stdin.setRawMode(true)
    }
  }

  // We ensure the output strings never exceed the MAX_BUFFER_SIZE
  proc.stdout?.on("data", (s) => {
    result.all = tailString(result.all + s, MAX_BUFFER_SIZE, true)
    result.stdout! = tailString(result.stdout! + s, MAX_BUFFER_SIZE, true)
  })

  proc.stderr?.on("data", (s) => {
    result.all = tailString(result.all + s, MAX_BUFFER_SIZE, true)
    result.stderr! = tailString(result.stderr! + s, MAX_BUFFER_SIZE, true)
  })

  stdout && proc.stdout?.pipe(stdout)
  stderr && proc.stderr?.pipe(stderr)

  if (data) {
    // This may happen if the spawned process errors while we're still writing data.
    proc.stdin?.on("error", () => {})

    proc.stdin?.end(data)
  }

  return new Promise<SpawnOutput>((resolve, reject) => {
    let _timeout: NodeJS.Timeout

    if (!wait) {
      resolve(result)
      return
    }

    const _reject = (err: GardenError) => {
      extend(err.detail, <any>result)
      reject(err)
    }

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        _reject(new TimeoutError(`${cmd} timed out after ${timeout} seconds.`, { cmd, args, opts }))
      }, timeout * 1000)
    }

    proc.on("error", (err) => {
      let msg = `An error occurred while trying to run '${cmd}' (${err.message}).`
      if ((<any>err).code === "ENOENT") {
        msg = `${msg} Please make sure '${cmd}' is installed and in the $PATH.`
      }
      _reject(new RuntimeError(msg, { cmd, args, opts, result, err }))
    })

    proc.on("close", (code) => {
      _timeout && clearTimeout(_timeout)
      result.code = code!

      if (code === 0 || ignoreError) {
        resolve(result)
      } else {
        const msg = makeErrorMsg({
          code: code!,
          cmd,
          args,
          output: result.all || result.stdout || result.stderr || "",
          error: result.stderr || "",
        })
        _reject(new RuntimeError(msg, { cmd, args, opts, result }))
      }
    })
  })
}

export async function dumpYaml(yamlPath, data) {
  return writeFile(yamlPath, safeDumpYaml(data, { noRefs: true }))
}

/**
 * Wraps safeDump and enforces that invalid values are skipped
 */
export function safeDumpYaml(data, opts: DumpOptions = {}) {
  return safeDump(data, { ...opts, skipInvalid: true })
}

/**
 * Encode multiple objects as one multi-doc YAML file
 */
export function encodeYamlMulti(objects: object[]) {
  return objects.map((s) => safeDumpYaml(s, { noRefs: true }) + "---\n").join("")
}

/**
 * Encode and write multiple objects as a multi-doc YAML file
 */
export async function dumpYamlMulti(yamlPath: string, objects: object[]) {
  return writeFile(yamlPath, encodeYamlMulti(objects))
}

/**
 * Splits the input string on the first occurrence of `delimiter`.
 */
export function splitFirst(s, delimiter) {
  const parts = s.split(delimiter)
  return [parts[0], parts.slice(1).join(delimiter)]
}

/**
 * Splits the input string on the last occurrence of `delimiter`.
 */
export function splitLast(s: string, delimiter: string) {
  const parts = s.split(delimiter)
  return [parts.slice(0, parts.length - 1).join(delimiter), parts[parts.length - 1]]
}

/**
 * Recursively process all values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepMap<T extends object, U extends object = T>(
  value: T | Iterable<T>,
  fn: (value: any, key: string | number) => any,
  key?: number | string
): U | Iterable<U> {
  if (isArray(value)) {
    return value.map((v, k) => <U>deepMap(v, fn, k))
  } else if (isPlainObject(value)) {
    return <U>mapValues(value, (v, k) => deepMap(<T>(<unknown>v), fn, k))
  } else {
    return <U>fn(value, key || 0)
  }
}

/**
 * Recursively filter all keys and values in the given input,
 * walking through all object keys _and array items_.
 */
export function deepFilter<T extends object, U extends object = T>(
  value: T | Iterable<T>,
  fn: (value: any, key: string | number) => boolean
): U | Iterable<U> {
  if (isArray(value)) {
    return <Iterable<U>>value.filter(fn).map((v) => deepFilter(v, fn))
  } else if (isPlainObject(value)) {
    return <U>mapValues(pickBy(<U>value, fn), (v) => deepFilter(v, fn))
  } else {
    return <U>value
  }
}

/**
 * Recursively resolves all promises in the given input,
 * walking through all object keys and array items.
 */
export async function deepResolve<T>(
  value: T | Iterable<T> | Iterable<PromiseLike<T>> | ResolvableProps<T>
): Promise<T | Iterable<T> | { [K in keyof T]: T[K] }> {
  if (isArray(value)) {
    return await Bluebird.map(value, deepResolve)
  } else if (isPlainObject(value)) {
    return await Bluebird.props(<ResolvableProps<T>>mapValues(<ResolvableProps<T>>value, deepResolve))
  } else {
    return Promise.resolve(<T>value)
  }
}

/**
 * Recursively maps over all keys in the input and resolves the resulting promises,
 * walking through all object keys and array items.
 */
export async function asyncDeepMap<T>(
  obj: T,
  mapper: (value) => Promise<any>,
  options?: Bluebird.ConcurrencyOption
): Promise<T> {
  if (isArray(obj)) {
    return <any>Bluebird.map(obj, (v) => asyncDeepMap(v, mapper, options), options)
  } else if (isPlainObject(obj)) {
    return <T>(
      fromPairs(
        await Bluebird.map(
          Object.entries(obj),
          async ([key, value]) => [key, await asyncDeepMap(value, mapper, options)],
          options
        )
      )
    )
  } else {
    return mapper(obj)
  }
}

export function omitUndefined(o: object) {
  return pickBy(o, (v: any) => v !== undefined)
}

/**
 * Recursively go through an object or array and strip all keys with undefined values, as well as undefined
 * values from arrays. Note: Also iterates through arrays recursively.
 */
export function deepOmitUndefined(obj: object) {
  return deepFilter(obj, (v) => v !== undefined)
}

export function serializeObject(o: any): string {
  return Buffer.from(Cryo.stringify(o)).toString("base64")
}

export function deserializeObject(s: string) {
  return Cryo.parse(Buffer.from(s, "base64"))
}

export function serializeValues(o: { [key: string]: any }): { [key: string]: string } {
  return mapValues(o, serializeObject)
}

export function deserializeValues(o: object) {
  return mapValues(o, deserializeObject)
}

export function getEnumKeys(Enum) {
  return Object.values(Enum).filter((k) => typeof k === "string") as string[]
}

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
  return safeLoad(fileData.toString())
}

export interface ObjectWithName {
  name: string
  [key: string]: any
}

export function getNames<T extends ObjectWithName>(array: T[]) {
  return array.map((v) => v.name)
}

export function findByName<T extends ObjectWithName>(array: T[], name: string): T | undefined {
  return find(array, ["name", name])
}

export function uniqByName<T extends ObjectWithName>(array: T[]): T[] {
  return uniqBy(array, (item) => item.name)
}

export function isDisjoint<T>(set1: Set<T>, set2: Set<T>): boolean {
  return !some([...set1], (element) => set2.has(element))
}

/**
 * Returns an array of arrays, where the elements of a given array are the elements of items for which
 * isRelated returns true for one or more elements of its class.
 *
 * I.e. an element is related to at least one element of its class, transitively.
 */
export function relationshipClasses<I>(items: I[], isRelated: (item1: I, item2: I) => boolean): I[][] {
  // We start with each item in its own class.
  //
  // We then keep looking for relationships/connections between classes and merging them when one is found,
  // until no two classes have elements that are related to each other.
  const classes: I[][] = items.map((i) => [i])

  let didMerge = false
  do {
    didMerge = false
    for (const classIndex1 of range(0, classes.length)) {
      for (const classIndex2 of range(0, classes.length)) {
        if (classIndex1 === classIndex2) {
          continue
        }
        const c1 = classes[classIndex1]
        const c2 = classes[classIndex2]
        if (some(c1, (i1) => some(c2, (i2) => isRelated(i1, i2)))) {
          // Then we merge c1 and c2.
          didMerge = true
          classes.splice(classIndex2, 1)
          classes[classIndex1] = [...c1, ...c2]
          break
        }
      }
      if (didMerge) {
        break
      }
    }
  } while (didMerge)
  // Once this point is reached, no two classes are related to each other, so we can return them.

  return classes
}

/**
 * Converts a string identifier to the appropriate casing and style for use in environment variable names.
 * (e.g. "my-service" -> "MY_SERVICE")
 */
export function getEnvVarName(identifier: string) {
  return identifier.replace(/-/g, "_").toUpperCase()
}

/**
 * Picks the specified keys from the given object, and throws an error if one or more keys are not found.
 */
export function pickKeys<T extends object, U extends keyof T>(obj: T, keys: U[], description = "key"): Pick<T, U> {
  const picked = pick(obj, ...keys)

  const missing = difference(<string[]>keys, Object.keys(picked))

  if (missing.length) {
    throw new ParameterError(`Could not find ${description}(s): ${missing.map((k, _) => k).join(", ")}`, {
      missing,
      available: Object.keys(obj),
    })
  }

  return picked
}

export function findByNames<T extends ObjectWithName>(names: string[], entries: T[], description: string) {
  const available = getNames(entries)
  const missing = difference(names, available)

  if (missing.length) {
    throw new ParameterError(`Could not find ${description}(s): ${missing.join(", ")}`, { available, missing })
  }

  return entries.filter(({ name }) => names.includes(name))
}

export function hashString(s: string, length?: number): string {
  const urlHash = createHash("sha256")
  urlHash.update(s)
  const str = urlHash.digest("hex")
  return length ? str.slice(0, length) : str
}

/**
 * Ensures that `obj` has an array at `key`, creating it if necessary, and then pushes `value` on that array.
 */
export function pushToKey(obj: object, key: string, value: any) {
  if (obj[key]) {
    if (!isArray(obj[key])) {
      throw new RuntimeError(`Value at '${key}' is not an array`, {
        obj,
        key,
      })
    }
    obj[key].push(value)
  } else {
    obj[key] = [value]
  }
}

/**
 * Returns true if `obj` is a Promise, otherwise false.
 */
export function isPromise(obj: any): obj is Promise<any> {
  return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function"
}

/**
 * A type guard that's useful e.g. when filtering an array which may have blank entries.
 */
export function isTruthy<T>(value: T | undefined | null | false | 0 | ""): value is T {
  return !!value
}

/**
 * Returns `true` if `path` is a subdirectory of `ofPath`. Returns `false` otherwise.
 */
export function isSubdir(path: string, ofPath: string): boolean {
  const rel = relative(path, ofPath)
  return !!(rel && !rel.startsWith("..") && !isAbsolute(rel))
}

// Used to make the platforms more consistent with other tools
const platformMap = {
  win32: "windows",
}

const archMap = {
  x32: "386",
  x64: "amd64",
}

export function getPlatform() {
  return platformMap[process.platform] || process.platform
}

export function getArchitecture() {
  const arch = process.arch
  return archMap[arch] || arch
}

export function getDurationMsec(start: Date, end: Date): number {
  return Math.round(end.getTime() - start.getTime())
}

export async function runScript({
  log,
  cwd,
  script,
  envVars,
}: {
  log: LogEntry
  cwd: string
  script: string
  envVars?: PrimitiveMap
}) {
  envVars = envVars || {}

  // Workaround for https://github.com/vercel/pkg/issues/897
  envVars.PKG_EXECPATH = ""

  // Run the script, capturing any errors
  const proc = execa("bash", ["-s"], {
    all: true,
    cwd,
    // The script is piped to stdin
    input: script,
    // Set a very large max buffer (we only hold one of these at a time, and want to avoid overflow errors)
    buffer: true,
    maxBuffer: 100 * 1024 * 1024,
    env: toEnvVars(envVars || {}),
  })

  // Stream output to `log`, splitting by line
  const stdout = split2()
  const stderr = split2()

  stdout.on("error", () => {})
  stdout.on("data", (line: Buffer) => {
    log.info(line.toString())
  })
  stderr.on("error", () => {})
  stderr.on("data", (line: Buffer) => {
    log.info(line.toString())
  })

  proc.stdout!.pipe(stdout)
  proc.stderr!.pipe(stderr)

  await proc
}

export async function streamToString(stream: Readable) {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })
}

/**
 * A writable stream that collects all data written, and features a `getString()` method.
 */
export class StringCollector extends Writable {
  private chunks: Buffer[]
  private error: Error

  constructor() {
    super()

    this.chunks = []

    this.on("data", (chunk) => this.chunks.push(Buffer.from(chunk)))
    this.on("error", (err) => {
      this.error = err
    })
  }

  // tslint:disable-next-line: function-name
  _write(chunk: Buffer, _: string, callback: () => void) {
    this.chunks.push(Buffer.from(chunk))
    callback()
  }

  getString() {
    if (this.error) {
      throw this.error
    }
    return Buffer.concat(this.chunks).toString("utf8")
  }
}

export function toEnvVars(vars: PrimitiveMap): { [key: string]: string | undefined } {
  return mapValues(vars, (v) => (v === undefined ? undefined : "" + v))
}

/**
 * Given a list of `items`, group them by `key` and return a list of `{ value, duplicateItems }` objects, where
 * `value` is the value of item[key] and `duplicateItems` are the items that share the value. If the list is empty,
 * no items have a duplicate value for the `key`.
 *
 * @example
 * const items = [{ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 2 }]
 * // returns [{ value: 1, duplicateItems: [{ a: 1, b: 1 }, { a: 1, b: 2 }] }]
 * duplicateKeys(items, "a")
 * // returns [{ value: 2, duplicateItems: [{ a: 1, b: 2 }, { a: 2, b: 2 }] }]
 * duplicateKeys(items, "b")
 */
export function duplicatesByKey(items: any[], key: string) {
  const grouped = groupBy(items, key)

  return Object.entries(grouped)
    .map(([value, duplicateItems]) => ({ value, duplicateItems }))
    .filter(({ duplicateItems }) => duplicateItems.length > 1)
}

export function isNotNull<T>(v: T | null): v is T {
  return v !== null
}

/**
 * Find and return the index of the given `slice` within `array`. Returns -1 if the slice is not found.
 *
 * Adapted from https://stackoverflow.com/posts/29426078/revisions
 *
 * @param array
 * @param slice
 */
export function findSlice(array: any[], slice: any[], fromIndex = 0) {
  let i = fromIndex
  const sliceLength = slice.length
  const l = array.length + 1 - sliceLength

  loop: for (; i < l; i++) {
    for (let j = 0; j < sliceLength; j++) {
      if (array[i + j] !== slice[j]) {
        continue loop
      }
    }
    return i
  }
  return -1
}

/**
 * Returns a copy of the given array, with the first instance (if any) of the given slice removed.
 */
export function removeSlice(array: any[], slice: any[]) {
  const out = [...array]
  const index = findSlice(array, slice)

  if (index > -1) {
    out.splice(index, slice.length)
  }

  return out
}

/**
 * Prompt the user for input, using inquirer.
 *
 * Note: Wrapping inquirer here and requiring inline because it is surprisingly slow to import on load.
 */
export function userPrompt(params: {
  name: string
  message: string
  type: "confirm" | "list" | "input"
  default?: any
  choices?: string[]
  pageSize?: number
}): Promise<any> {
  return require("inquirer").prompt(params)
}

export function getGitHubIssueLink(title: string, type: "bug" | "feature-request") {
  if (type === "feature-request") {
    return `https://github.com/garden-io/garden/issues/new?assignees=&labels=feature+request&template=FEATURE_REQUEST.md&title=%5BFEATURE%5D%3A+${title}`
  } else {
    return `https://github.com/garden-io/garden/issues/new?assignees=&labels=&template=BUG_REPORT.md&title=${title}`
  }
}
