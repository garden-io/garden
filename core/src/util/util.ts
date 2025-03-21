/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { asyncExitHook, gracefulExit } from "@scg82/exit-hook"
import _spawn from "cross-spawn"
import { createHash } from "node:crypto"
import {
  difference,
  find,
  fromPairs,
  groupBy,
  isArray,
  isPlainObject,
  mapValues,
  omit,
  pick,
  range,
  round,
  some,
  uniqBy,
} from "lodash-es"
import type { Options as PMapOptions } from "p-map"
import pMap from "p-map"
import pProps from "p-props"
import { isAbsolute, relative } from "node:path"
import type { Readable } from "stream"
import { Writable } from "stream"
import type { PrimitiveMap } from "../config/common.js"
import { gardenEnv } from "../constants.js"
import {
  ChildProcessError,
  InternalError,
  isErrnoException,
  isExecaError,
  ParameterError,
  RuntimeError,
  TimeoutError,
} from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import { getDefaultProfiler } from "./profiling.js"
import { dedent, naturalList, tailString } from "./string.js"
import split2 from "split2"
import type { Options as ExecaOptions } from "execa"
import { execa } from "execa"
import corePackageJson from "../../package.json" with { type: "json" }
import { makeDocsLinkStyled } from "../docs/common.js"
import { getPlatform } from "./arch-platform.js"
import { toClearText, type MaybeSecret } from "./secrets.js"

export { apply as jsonMerge } from "json-merge-patch"

export type HookCallback = (signal: number) => void | Promise<void>

const exitHookNames: string[] = [] // For debugging/testing/inspection purposes

// For creating a subset of a union type, see: https://stackoverflow.com/a/53637746
export type PickFromUnion<T, U extends T> = U
export type ValueOf<T> = T[keyof T]
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type Diff<T, U> = T extends U ? never : T
export type Mutable<T> = { -readonly [K in keyof T]: T[K] }
export type Nullable<T> = { [P in keyof T]: T[P] | null }
export type MaybeUndefined<T> = T | undefined
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
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export interface Dictionary<T> {
  [index: string]: T
}

const MAX_BUFFER_SIZE = 1024 * 1024

// Used to control process-level operations during testing
export const testFlags = {
  expandErrors: false,
  disableShutdown: false,
}

export async function shutdown(code?: number) {
  // This is a good place to log exitHookNames if needed.
  if (!testFlags.disableShutdown) {
    if (gardenEnv.GARDEN_ENABLE_PROFILING) {
      // eslint-disable-next-line no-console
      console.log(getDefaultProfiler().report())
    }

    gracefulExit(code)
  }
}

export function registerCleanupFunction(name: string, func: HookCallback) {
  exitHookNames.push(name)
  const callbackFunc = (signal: number) => {
    return Promise.resolve(func(signal))
  }
  asyncExitHook(callbackFunc, {
    minimumWait: 10000,
  })
}

export function getPackageVersion(): string {
  // This code will be replaced by the version number during the build process in rollup.config.js. Please update the rollup config as well if you change the following line.
  const { version } = corePackageJson as { version: string }
  return version
}

export async function sleep(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec))
}

/**
 * Returns a promise that can be resolved/rejected by calling resolve/reject.
 */
export type Deferred<T> = {
  resolve: (value: T) => void
  reject: (reason?: any) => void
  promise: Promise<T>
}

export function defer<T>(): Deferred<T> {
  let resolve: (value: T) => void
  let reject: (reason?: any) => void

  const promise = new Promise((pResolve, pReject) => {
    resolve = pResolve
    reject = pReject
  }) as Promise<T>

  return {
    resolve: resolve!,
    reject: reject!,
    promise,
  }
}

/**
 * Creates an output stream that logs the message.
 */
export function createOutputStream(log: Log, origin?: string) {
  const outputStream = split2()
  const streamLog = log.createLog({ origin })

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    streamLog.info({ msg: line.toString() })
  })

  return outputStream
}

export function prepareClearTextEnv(env: Record<string, MaybeSecret | undefined> | undefined): NodeJS.ProcessEnv {
  const envOverride =
    getPlatform() === "windows"
      ? {
          // Prevent Windows from adding the current directory to the PATH implicitly.
          NoDefaultCurrentDirectoryInExePath: "TRUE",
        }
      : {}

  return toClearText({
    ...process.env,
    ...(env || {}),
    ...envOverride,
  })
}

export type ExecOpts = Omit<ExecaOptions, "env"> & {
  stdout?: Writable
  stderr?: Writable
  environment?: Record<string, MaybeSecret | undefined>
}

/**
 * A wrapper function around execa that standardises error messages.
 * Enforces `buffer: true` (which is the default execa behavior).
 *
 * Also adds the ability to pipe stdout|stderr to an output stream.
 *
 * @throws RuntimeError on EMFILE (Too many open files)
 * @throws ChildProcessError on any other error condition
 */
export async function exec(cmd: string, args: MaybeSecret[], opts: ExecOpts = {}) {
  const proc = execa(cmd, args.map(toClearText), {
    cwd: process.cwd(),
    windowsHide: true,
    ...omit(opts, "stdout", "stderr"),
    env: prepareClearTextEnv(opts.environment),
    // Ensure buffer is always set to true so that we can read the error output
    // Defaulting cwd to process.cwd() to avoid defaulting to a virtual path after packaging with pkg
    buffer: true,
    all: true,
  })

  opts.stdout && proc.stdout && proc.stdout.pipe(opts.stdout)
  opts.stderr && proc.stderr && proc.stderr.pipe(opts.stderr)

  try {
    const res = await proc
    return res
  } catch (err) {
    if (isErrnoException(err) && err.code === "EMFILE") {
      throw new RuntimeError({
        message: dedent`
        Received EMFILE (Too many open files) error when running ${cmd}.

        This may mean there are too many files in the project, and that you need to exclude large dependency directories. Please see ${makeDocsLinkStyled("using-garden/configuration-overview", "#including-excluding-files-and-directories")} for information on how to do that.

        This can also be due to limits on open file descriptors being too low. Here is one guide on how to configure those limits for different platforms: https://docs.riak.com/riak/kv/latest/using/performance/open-files-limit/index.html
        `,
      })
    } else if (isErrnoException(err)) {
      throw new RuntimeError({
        message: `Failed to run ${cmd}: ${err}`,
        code: err.code,
      })
    }

    if (isExecaError(err)) {
      throw new ChildProcessError({
        cmd,
        // toString redacts secret values, if args happens to contain any.
        args: args.map((a) => a.toString()),
        code: err.exitCode,
        output: err.all || err.stdout || err.stderr || "",
        stderr: err.stderr || "",
        stdout: err.stdout || "",
      })
    }

    const error = err as Error
    throw new InternalError({ message: error.message })
  }
}

export interface SpawnOpts {
  timeoutSec?: number
  cwd?: string
  data?: Buffer
  ignoreError?: boolean
  env?: { [key: string]: MaybeSecret | undefined }
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
 *
 * @throws RuntimeError on ENOENT (command not found)
 * @throws ChildProcessError on any other error condition
 */
export function spawn(cmd: string, args: string[], opts: SpawnOpts = {}) {
  const {
    timeoutSec: timeout = 0,
    cwd = process.cwd(), // This is to avoid running from a virtual path after packaging in pkg
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
  const proc = _spawn(cmd, args, { cwd, env: prepareClearTextEnv(env), stdio, windowsHide: true })

  const result: SpawnOutput = {
    code: 0,
    all: "",
    stdout: "",
    stderr: "",
    proc,
  }

  const _process = <any>process

  if (tty) {
    if (data) {
      throw new InternalError({
        message: `Cannot pipe to stdin when tty=true. (spawn(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`,
      })
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

    if (timeout > 0) {
      _timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        reject(new TimeoutError({ message: `${cmd} timed out after ${timeout} seconds.` }))
      }, timeout * 1000)
    }

    proc.on("error", (err) => {
      let msg = `An error occurred while trying to run '${cmd}' (${err.message}).`
      if ((<any>err).code === "ENOENT") {
        msg = `${msg} Please make sure '${cmd}' is installed and in the $PATH.`
        cwd && (msg = `${msg} Please make sure '${cwd}' exists and is a valid directory path.`)
      }
      reject(new RuntimeError({ message: msg }))
    })

    proc.on("close", (code) => {
      _timeout && clearTimeout(_timeout)
      result.code = code!

      if (code === 0 || ignoreError) {
        resolve(result)
      } else {
        reject(
          new ChildProcessError({
            cmd,
            args,
            code: result.code,
            opts,
            output: result.all,
            stderr: result.stderr,
            stdout: result.stdout,
          })
        )
      }
    })
  })
}

/**
 * Recursively resolves all promises in the given input,
 * walking through all object keys and array items.
 */
type Resolvable<R> = R | PromiseLike<R>
type ResolvableProps<T> = object & { [K in keyof T]: Resolvable<T[K]> }

export async function deepResolve<T>(
  value: T | Iterable<T> | Iterable<PromiseLike<T>> | ResolvableProps<T>
): Promise<T | Iterable<T> | { [K in keyof T]: T[K] }> {
  if (isArray(value)) {
    return await pMap(value, deepResolve)
  } else if (isPlainObject(value)) {
    return (await pProps(<ResolvableProps<T>>mapValues(<ResolvableProps<T>>value, deepResolve))) as {
      [K in keyof T]: T[K]
    }
  } else {
    return Promise.resolve(<T>value)
  }
}

type DeepMappable = any | ArrayLike<DeepMappable> | { [k: string]: DeepMappable }

/**
 * Recursively maps over all keys in the input and resolves the resulting promises,
 * walking through all object keys and array items.
 */
export async function asyncDeepMap<T extends DeepMappable>(
  obj: T,
  mapper: (value) => Promise<any>,
  options?: PMapOptions
): Promise<T> {
  if (isArray(obj)) {
    return <any>pMap(obj, (v) => asyncDeepMap(v, mapper, options), options)
  } else if (isPlainObject(obj)) {
    return <T>(
      fromPairs(
        await pMap(
          Object.entries(obj as { [k: string]: DeepMappable }),
          async ([key, value]) => [key, await asyncDeepMap(value, mapper, options)],
          options
        )
      )
    )
  } else {
    return mapper(obj)
  }
}

export function getEnumKeys(Enum) {
  return Object.values(Enum).filter((k) => typeof k === "string") as string[]
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
 * Removes all keys from `obj` (except those inherited from the object's prototype).
 *
 * Essentially a vanilla object analog of `map.clear()` for ES5 Maps.
 */
export function clearObject<T extends object>(obj: T) {
  for (const key of Object.getOwnPropertyNames(obj)) {
    delete obj[key]
  }
}

/**
 * Picks the specified keys from the given object, and throws an error if one or more keys are not found.
 */
export function pickKeys<T extends object, U extends keyof T>(obj: T, keys: U[], description = "key"): Pick<T, U> {
  const picked = pick(obj, ...keys)

  const missing = difference(<string[]>keys, Object.keys(picked))

  if (missing.length) {
    throw new ParameterError({
      message: `Could not find ${description}(s): ${missing.map((k, _) => k).join(", ")}. Available: ${naturalList(
        Object.keys(obj)
      )}`,
    })
  }

  return picked
}

export function findByNames<T extends ObjectWithName>({
  names,
  entries,
  description,
  allowMissing,
}: {
  names: string[]
  entries: T[]
  description: string
  allowMissing: boolean
}) {
  const available = getNames(entries)
  const missing = difference(names, available)

  if (missing.length && !allowMissing) {
    throw new ParameterError({
      message: `Could not find ${description}(s): ${missing.join(", ")}. Available: ${naturalList(available)}`,
    })
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
      throw new RuntimeError({
        message: `Value at '${key}' is not an array. Got ${typeof obj[key]}`,
      })
    }
    obj[key].push(value)
  } else {
    obj[key] = [value]
  }
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

export function getDurationMsec(start: Date, end: Date): number {
  return Math.round(end.getTime() - start.getTime())
}

export async function runScript({
  log,
  cwd,
  script,
  envVars,
}: {
  log: Log
  cwd: string
  script: string
  envVars?: PrimitiveMap
}) {
  const env = toEnvVars(envVars || {})
  const outputStream = split2()
  outputStream.on("error", (line: Buffer) => {
    log.error(line.toString())
  })
  outputStream.on("data", (line: Buffer) => {
    log.info(line.toString())
  })
  const errorStream = split2()
  errorStream.on("error", (line: Buffer) => {
    log.error(line.toString())
  })
  errorStream.on("data", (line: Buffer) => {
    // NOTE: We're intentionally logging stderr streams at the "info" level
    // because some tools will write to stderr even if it's not an actual error.
    // So rendering it as such will look confusing to the user.
    // An example of this is the gcloud CLI tool. If run from e.g. the exec
    // provider init script, Garden would log those lines as errors if we don't
    // use the info level here.
    // Actual error are handled specifically.
    log.info(line.toString())
  })
  // script can be either a command or path to an executable
  // shell script since we use the shell option.
  const result = await exec(script, [], {
    shell: true,
    cwd,
    environment: env,
    stdout: outputStream,
    stderr: errorStream,
  })
  return result
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
  private error?: Error

  constructor() {
    super()

    this.chunks = []

    this.on("data", (chunk) => this.chunks.push(Buffer.from(chunk)))
    this.on("error", (err) => {
      this.error = err
    })
  }

  override _write(chunk: Buffer, _: string, callback: () => void) {
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
export async function userPrompt(params: { message: string; type: "confirm" | "input"; default?: any }): Promise<any> {
  const { confirm, input } = await import("@inquirer/prompts")
  const { message, type, default: _default } = params
  if (type === "confirm") {
    return confirm({ message, default: _default })
  }
  if (type === "input") {
    return input({ message, default: _default })
  }
  return type satisfies never
}

/**
 * Check if a given date instance is valid.
 */
export function isValidDateInstance(d: any) {
  return !isNaN(d) && d instanceof Date
}

export function* sliceToBatches<T>(elements: T[], batchSize: number) {
  let position = 0

  while (position < elements.length) {
    yield elements.slice(position, position + batchSize)
    position += batchSize
  }
}

export function renderTimeUnit(amount: number, unit: "hour" | "minute" | "second") {
  if (amount <= 0) {
    return ""
  }

  return amount + (amount === 1 ? ` ${unit}` : ` ${unit}s`)
}

export function renderTimeDuration(start: Date, end: Date): string {
  const durationMs = end.getTime() - start.getTime()
  if (durationMs === 0) {
    return ""
  }

  const durationSec = round(durationMs / 1000, 2)
  if (durationSec === 0) {
    return ""
  }

  if (durationSec < 60) {
    return `${durationSec} seconds`
  }

  const h = Math.floor(durationSec / 3600)
  const m = Math.floor((durationSec % 3600) / 60)
  const s = Math.floor((durationSec % 3600) % 60)

  const renderedUnits = [renderTimeUnit(h, "hour"), renderTimeUnit(m, "minute"), renderTimeUnit(s, "second")]
  return renderedUnits.join(" ")
}
