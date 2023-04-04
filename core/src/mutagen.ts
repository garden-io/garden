/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import chalk from "chalk"
import { join } from "path"
import { mkdirp, pathExists } from "fs-extra"
import respawn from "respawn"
import { Log } from "./logger/log-entry"
import { PluginToolSpec } from "./plugin/tools"
import { PluginTool } from "./util/ext-tools"
import { registerCleanupFunction, sleep } from "./util/util"
import { GardenBaseError } from "./exceptions"
import pRetry from "p-retry"
import { syncGuideLink } from "./plugins/kubernetes/sync"
import dedent from "dedent"
import { PluginContext } from "./plugin-context"
import Bluebird from "bluebird"
import { MUTAGEN_DIR_NAME } from "./constants"
import { ExecaReturnValue } from "execa"
import EventEmitter from "events"
import split2 from "split2"
import { TypedEventEmitter } from "./util/events"

const maxRestarts = 10
const mutagenLogSection = "<mutagen>"
const crashMessage = `Synchronization monitor has crashed ${maxRestarts} times. Aborting.`
const syncLogPrefix = "[sync]:"

export const mutagenAgentPath = "/.garden/mutagen-agent"

let lastDaemonError = ""

export const mutagenModeMap = {
  "one-way": "one-way-safe",
  "one-way-safe": "one-way-safe",
  "one-way-reverse": "one-way-safe",
  "one-way-replica": "one-way-replica",
  "one-way-replica-reverse": "one-way-replica",
  "two-way": "two-way-safe",
  "two-way-safe": "two-way-safe",
  "two-way-resolved": "two-way-resolved",
}

// This is basically copied from:
// https://github.com/mutagen-io/mutagen/blob/19e087599f187d85416d453cd50e2a9df1602132/pkg/synchronization/state.go
// with an updated description to match Garden's context.
const mutagenStatusDescriptions = {
  "disconnected": "Sync disconnected",
  "halted-on-root-emptied": "Sync halted because either the source or target directory was emptied",
  "halted-on-root-deletion": "Sync halted because either the source or target was deleted",
  "halted-on-root-type-change": "Sync halted because either the source or target changed type",
  "connecting-alpha": "Sync connected to source",
  "connecting-beta": "Sync connected to target",
  "watching": "Watching for changes",
  "scanning": "Scanning files to sync",
  "waiting-for-rescan": "Waiting 5 seconds for sync rescan",
  "reconciling": "Reconciling sync changes",
  "staging-alpha": "Staging files to sync in source",
  "staging-beta": "Staging files to sync in target",
  "transitioning": "Syncing changes...",
  "saving": "Saving sync archive",
}

/**
 * Types are missing for the "respawn" package so adding some basic ones here.
 */
interface MonitorProc extends EventEmitter {
  status: string
  start: () => {}
  stop: () => {}
}

type MutagenStatus = keyof typeof mutagenStatusDescriptions

export interface SyncConfig {
  alpha: string
  beta: string
  mode: keyof typeof mutagenModeMap
  ignore: string[]
  defaultOwner?: number | string
  defaultGroup?: number | string
  defaultFileMode?: number
  defaultDirectoryMode?: number
}

interface ActiveSync {
  created: Date
  sourceDescription: string
  targetDescription: string
  logSection: string
  sourceConnected: boolean
  targetConnected: boolean
  config: SyncConfig
  lastProblems: string[]
  lastStatus?: string
  lastSyncCount: number
  initialSyncComplete: boolean
  paused: boolean
  mutagenParameters: string[]
}

export class MutagenError extends GardenBaseError {
  type = "mutagen"
}

interface MutagenDaemonParams {
  ctx: PluginContext
  log: Log
  dataDir?: string
}

interface MutagenMonitorParams {
  log: Log
  dataDir: string
}

let monitorLock = new AsyncLock()
let _monitor: _MutagenMonitor

export function getMutagenMonitor(params: MutagenMonitorParams) {
  if (!_monitor) {
    _monitor = new _MutagenMonitor(params)
  }
  return _monitor
}

interface MonitorEvents {
  status: SyncSession
}

/**
 * Wrapper around `mutagen sync monitor`. This is used as a singleton, and emits events for instances of
 * `Mutagen` to subscribe to and log as appropriate.
 */
class _MutagenMonitor extends TypedEventEmitter<MonitorEvents> {
  private log: Log
  private dataDir: string
  public configLock: AsyncLock
  private proc?: MonitorProc

  constructor({ log, dataDir }: MutagenMonitorParams) {
    super()
    this.log = log
    this.configLock = new AsyncLock()
    this.dataDir = dataDir

    registerCleanupFunction("stop-mutagen-monitor", () => {
      this.proc?.stop()
    })
  }

  started() {
    return this.proc?.status && this.proc.status !== "crashed"
  }

  async start() {
    if (this.started()) {
      return
    }

    return monitorLock.acquire("start", async () => {
      if (this.started()) {
        return
      }

      const log = this.log

      const mutagenPath = await mutagenCli.getPath(log)
      const dataDir = this.dataDir

      await mkdirp(dataDir)

      const proc = respawn([mutagenPath, "sync", "monitor", "--template", "{{ json . }}", "--long"], {
        cwd: dataDir,
        name: "mutagen",
        env: {
          MUTAGEN_DATA_DIRECTORY: dataDir,
          MUTAGEN_LOG_LEVEL: "debug",
        },
        maxRestarts,
        sleep: 3000,
        kill: 500,
        stdio: "pipe",
        fork: false,
      }) as MonitorProc

      this.proc = proc

      proc.on("crash", () => {
        log.warn(chalk.yellow(crashMessage))
      })

      proc.on("exit", (code: number) => {
        if (code && code !== 0) {
          log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.yellow(`Synchronization monitor exited with code ${code}.`),
          })
        }
      })

      const handleOutput = (data: Buffer) => {
        const str = data.toString().trim()
        // This is a little dumb, to detect if the log line starts with a timestamp, but ya know...
        // it'll basically work for the next 979 years :P.
        const msg = chalk.gray(str.startsWith("2") ? str.split(" ").slice(3).join(" ") : str)
        if (msg.includes("Unable") && lastDaemonError !== msg) {
          log.warn({ symbol: "warning", section: mutagenLogSection, msg })
          // Make sure we don't spam with repeated messages
          lastDaemonError = msg
        } else {
          log.silly({ symbol: "empty", section: mutagenLogSection, msg })
        }
      }

      // Parse JSON lines from monitor
      const jsonStream = split2()

      jsonStream.on("error", () => {})

      jsonStream.on("data", (line: Buffer) => {
        try {
          // TODO: validate this input
          const parsed = JSON.parse(line.toString())
          for (const session of parsed) {
            this.emit("status", session)
          }
        } catch {
          // TODO: see if there are specific errors we need to catch here
        }
      })

      proc.on("stdout", (data: Buffer) => {
        jsonStream.write(data)
      })
      proc.on("stderr", handleOutput)

      return new Promise<MonitorProc>((resolve, reject) => {
        let resolved = false

        proc.on("spawn", () => {
          if (resolved) {
            log.debug({
              symbol: "empty",
              section: mutagenLogSection,
              msg: chalk.green("Mutagen monitor re-started"),
            })
          }
        })

        proc.once("spawn", () => {
          setTimeout(() => {
            if (proc?.status === "running") {
              resolved = true
              resolve(proc)
            }
          }, 500)
        })

        proc.once("crash", () => {
          if (!resolved) {
            reject(crashMessage)
          }
        })

        proc.start()
      })
    })
  }

  async stop() {
    return monitorLock.acquire("monitor", async () => {
      this.proc?.stop()
      delete this.proc
    })
  }
}

/**
 * A class for managing the Mutagen daemon process and its syncs.
 *
 * The mutagen daemon itself is managed by the `mutagen start/stop` commands.
 * An instance of this class is scoped to a specific environment/namespace and only interacts with
 * relevant syncs.
 */
export class Mutagen {
  private log: Log
  private dataDir: string
  private activeSyncs: { [key: string]: ActiveSync }
  private monitorHandler: (session: SyncSession) => void
  private configLock: AsyncLock
  private monitoring: boolean

  constructor({ ctx, log, dataDir }: MutagenDaemonParams) {
    this.log = log
    this.configLock = new AsyncLock()
    this.dataDir = dataDir || join(ctx.gardenDirPath, MUTAGEN_DIR_NAME)
    this.activeSyncs = {}
    this.monitoring = false

    // TODO: This is a little noisy atm. We could be a bit smarter and filter some superfluous messages out.
    this.monitorHandler = (session) => {
      const key = session.name
      const activeSync = this.activeSyncs[key]

      if (!activeSync) {
        // Not tracking this sync
        return
      }

      const { sourceDescription, targetDescription } = activeSync

      const problems: string[] = [
        ...(session.alpha.scanProblems || []).map((p) => `Error scanning sync source, path ${p.path}: ${p.error}`),
        ...(session.beta.scanProblems || []).map((p) => `Error scanning sync target, path ${p.path}: ${p.error}`),
        ...(session.alpha.transitionProblems || []).map(
          (p) => `Error transitioning sync source, path ${p.path}: ${p.error}`
        ),
        ...(session.beta.transitionProblems || []).map(
          (p) => `Error transitioning sync target, path ${p.path}: ${p.error}`
        ),
        ...(session.conflicts || []).map((c) => formatSyncConflict(sourceDescription, targetDescription, c)),
      ]

      const { logSection: section } = activeSync

      for (const problem of problems) {
        if (!activeSync.lastProblems.includes(problem)) {
          log.warn({ symbol: "warning", section, msg: chalk.yellow(problem) })
        }
      }

      if (session.alpha.connected && !activeSync.sourceConnected) {
        log.info({
          symbol: "info",
          section,
          msg: chalk.gray(`Connected to sync source ${sourceDescription}`),
        })
        activeSync.sourceConnected = true
      }

      if (session.beta.connected && !activeSync.targetConnected) {
        log.info({
          symbol: "success",
          section,
          msg: chalk.gray(`Connected to sync target ${targetDescription}`),
        })
        activeSync.targetConnected = true
      }

      const syncCount = session.successfulCycles || 0
      const description = `from ${sourceDescription} to ${targetDescription}`
      const isInitialSync = activeSync.lastSyncCount === 0

      // Mutagen resets the sync count to zero after resuming from a sync paused
      // so we keep track of whether the initial sync has completed so that we
      // don't log it multiple times.
      if (syncCount > activeSync.lastSyncCount && !activeSync.initialSyncComplete) {
        log.info({
          symbol: "success",
          section,
          msg: chalk.white(`${syncLogPrefix} Completed initial sync ${description}`),
        })
        activeSync.initialSyncComplete = true
      }

      let statusMsg: string | undefined

      if (syncCount > activeSync.lastSyncCount && !isInitialSync) {
        const time = new Date().toLocaleTimeString()
        statusMsg = `Synchronized ${description} at ${time}`
      } else if (activeSync.paused && !session.paused) {
        statusMsg = `Sync resumed`
      } else if (!activeSync.paused && session.paused) {
        statusMsg = `Sync paused`
      } else if (activeSync.lastStatus && session.status && session.status === "disconnected") {
        // Don't print disconnected message when no status was set prior (likely when starting the sync)
      } else if (session.status && session.status !== activeSync.lastStatus) {
        statusMsg = mutagenStatusDescriptions[session.status]
      }

      if (statusMsg) {
        log.info({
          symbol: "info",
          section,
          msg: chalk.gray(`${syncLogPrefix} ${statusMsg}`),
        })
      }

      activeSync.lastSyncCount = syncCount
      activeSync.lastProblems = problems
      activeSync.lastStatus = session.status
      activeSync.paused = session.paused
    }
  }

  async ensureDaemon(log: Log) {
    await this.execCommand(log, ["daemon", "start"])
  }

  /**
   * Make sure the specified sync is active. Does nothing if a sync is already active with the same key.
   * (When configuration changes, the whole daemon is reset).
   */
  async ensureSync({
    log,
    logSection,
    key,
    sourceDescription,
    targetDescription,
    config,
  }: {
    log: Log
    logSection: string
    key: string
    sourceDescription: string
    targetDescription: string
    config: SyncConfig
  }) {
    await this.startMonitoring()

    if (this.activeSyncs[key]) {
      return
    }

    return this.configLock.acquire("configure", async () => {
      if (this.activeSyncs[key]) {
        return
      }

      const { alpha, beta, ignore, mode, defaultOwner, defaultGroup, defaultDirectoryMode, defaultFileMode } = config

      const ignoreFlags = ignore.flatMap((i) => ["-i", i])
      const syncMode = mutagenModeMap[mode]
      const params = [alpha, beta, "--name", key, "--sync-mode", syncMode, ...ignoreFlags]

      if (defaultOwner) {
        params.push("--default-owner", defaultOwner.toString())
      }
      if (defaultGroup) {
        params.push("--default-group", defaultGroup.toString())
      }
      if (defaultFileMode) {
        params.push("--default-file-mode", modeToString(defaultFileMode))
      }
      if (defaultDirectoryMode) {
        params.push("--default-directory-mode", modeToString(defaultDirectoryMode))
      }

      const active = await this.getActiveSyncSessions(log)
      let existing = active.find((s) => s.name === key)

      if (existing) {
        // TODO: compare existing sync instead of just re-creating naively (need help from Mutagen side)
        await this.terminateSync(log, key)
      }

      log.debug(`Starting mutagen sync ${key}...`)

      this.activeSyncs[key] = {
        created: new Date(),
        sourceDescription,
        targetDescription,
        logSection,
        sourceConnected: await isValidLocalPath(config.alpha),
        targetConnected: await isValidLocalPath(config.beta),
        config,
        lastProblems: [],
        lastStatus: "",
        lastSyncCount: 0,
        initialSyncComplete: false,
        paused: false,
        mutagenParameters: params,
      }

      // Might need to retry
      await pRetry(() => this.execCommand(log, ["sync", "create", ...params]), {
        retries: 5,
        minTimeout: 1000,
        onFailedAttempt: (err) => {
          log.warn(
            `Failed to start sync from ${sourceDescription} to ${targetDescription}. ${err.retriesLeft} attempts left.`
          )
        },
      })

      log.debug(`Mutagen sync ${key} started.`)
    })
  }

  /**
   * Remove the specified sync (by name) from the sync daemon.
   */
  async terminateSync(log: Log, key: string) {
    log.debug(`Terminating mutagen sync ${key}...`)

    try {
      await this.execCommand(log, ["sync", "terminate", key])
      delete this.activeSyncs[key]
      log.debug(`Mutagen sync ${key} terminated.`)
    } catch (err) {
      // Ignore other errors, which should mean the sync wasn't found
      if (err.message.includes("unable to connect to daemon")) {
        throw err
      }
    }
  }

  /**
   * Ensure a sync is completed.
   */
  async flushSync(log: Log, key: string) {
    await pRetry(() => this.execCommand(log, ["sync", "flush", key]), {
      retries: 5,
      minTimeout: 1000,
      onFailedAttempt: async (err) => {
        const unableToFlush = err.message.match(/unable to flush session/)
        if (unableToFlush) {
          log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.gray(
              `Could not flush synchronization changes, retrying (attempt ${err.attemptNumber}/${err.retriesLeft})...`
            ),
          })
        } else {
          throw err
        }
      },
    })

    await this.execCommand(log, ["sync", "flush", key])
  }

  /**
   * Ensure all active syncs are completed.
   */
  async flushAllSyncs(log: Log) {
    const active = await this.getActiveSyncSessions(log)
    await Bluebird.map(active, async (session) => {
      try {
        await this.flushSync(log, session.name)
      } catch (err) {
        log.warn(chalk.yellow(`Failed to flush sync '${session.name}: ${err.message}`))
      }
    })
  }

  /**
   * List all Mutagen sync sessions.
   */
  async getActiveSyncSessions(log: Log): Promise<SyncSession[]> {
    const res = await this.execCommand(log, ["sync", "list", "--template={{ json . }}"])
    return parseSyncListResult(res)
  }

  /**
   * Just register a sync to monitor, without starting it.
   */
  monitorSync({
    logSection,
    key,
    sourceDescription,
    targetDescription,
    config,
  }: {
    logSection: string
    key: string
    sourceDescription: string
    targetDescription: string
    config: SyncConfig
  }) {
    this.activeSyncs[key] = {
      created: new Date(),
      sourceDescription,
      targetDescription,
      logSection,
      sourceConnected: false,
      targetConnected: false,
      config,
      lastProblems: [],
      lastStatus: "",
      lastSyncCount: 0,
      initialSyncComplete: false,
      paused: false,
      mutagenParameters: [],
    }
  }

  /**
   * Execute a Mutagen command with retries. Restarts the daemon process
   * between retries if Mutagen is unable to connect to it.
   */
  private async execCommand(log: Log, args: string[]) {
    let loops = 0
    const maxRetries = 10

    while (true) {
      try {
        const res = mutagenCli.exec({
          cwd: this.dataDir,
          args,
          log,
          env: getMutagenEnv(this.dataDir),
        })
        return res
      } catch (err) {
        const unableToConnect = err.message.match(/unable to connect to daemon/)
        if (unableToConnect && loops < 10) {
          loops += 1
          log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.gray(`Could not connect to sync daemon, retrying (attempt ${loops}/${maxRetries})...`),
          })
          await this.ensureDaemon(log)
          await sleep(2000 + loops * 500)
        } else {
          throw err
        }
      }
    }
  }

  async terminateSyncs(log: Log) {
    await Bluebird.map(Object.keys(this.activeSyncs), async (key) => {
      await this.execCommand(log, ["sync", "terminate", key])
      delete this.activeSyncs[key]
    })
  }

  async restartDaemonProc(log: Log) {
    await this.stopDaemonProc(log)
    await this.ensureDaemon(log)
  }

  async startMonitoring() {
    if (this.monitoring) {
      return
    }
    const monitor = this.getMonitor()
    await monitor.start()
    this.monitoring = true
    monitor.on("status", this.monitorHandler)
  }

  stopMonitoring() {
    const monitor = this.getMonitor()
    monitor.off("status", this.monitorHandler)
    this.monitoring = false
  }

  async killMonitor() {
    const monitor = this.getMonitor()
    await monitor.stop()
  }

  private getMonitor() {
    return getMutagenMonitor({ dataDir: this.dataDir, log: this.log })
  }

  private async stopDaemonProc(log: Log) {
    try {
      await this.execCommand(log, ["daemon", "stop"])
    } catch {}
  }
}

interface SyncProblem {
  path: string
  error: string
}

interface SyncEntry {
  kind: string
  // TODO: Add contents for directory entries
  digest?: string
  executable?: boolean
  target?: string
  problem?: string
}

interface SyncChange {
  path: string
  old?: SyncEntry
  new?: SyncEntry
}

interface SyncConflict {
  root: string
  alphaChanges: SyncChange[]
  betaChanges: SyncChange[]
}

interface SyncReceiverStatus {
  path: string
  receivedSize: number
  expectedSize: number
  receivedFiles: number
  expectedFiles: number
  totalReceivedSize: number
}

interface SyncEndpoint {
  protocol: string // Only used for remote endpoints
  user?: string // Only used for remote endpoints
  host?: string // Only used for remote endpoints
  port?: number // Only used for remote endpoints
  path: string
  // TODO: Add environment variables
  // TODO: Add parameter variables
  // TODO: Add endpoint-specific configuration
  connected: boolean
  scanned?: boolean
  directories?: number
  files?: number
  symbolicLinks?: number
  totalFileSize?: number
  scanProblems?: SyncProblem[]
  excludedScanProblems?: number
  transitionProblems?: SyncProblem[]
  excludedTransitionProblems?: number
  stagingProgress?: SyncReceiverStatus
}

interface SyncSession {
  identifier: string
  version: number
  creationTime: string
  creatingVersion: string
  alpha: SyncEndpoint
  beta: SyncEndpoint
  mode: string
  // TODO: Add additional configuration parameters
  name: string // TODO: This is technically an optional field
  // TODO: Add labels
  paused: boolean
  status?: MutagenStatus
  lastError?: string
  successfulCycles?: number
  conflicts?: SyncConflict[]
  excludedConflicts?: number
}

export function getMutagenEnv(dataDir: string) {
  return {
    MUTAGEN_DATA_DIRECTORY: dataDir,
  }
}

export function parseSyncListResult(res: ExecaReturnValue): SyncSession[] {
  // TODO: validate further
  let parsed: any = []

  try {
    parsed = JSON.parse(res.stdout)
  } catch (err) {
    throw new MutagenError(`Could not parse response from mutagen sync list: ${res.stdout}`, { res })
  }

  if (!Array.isArray(parsed)) {
    throw new MutagenError(`Unexpected response from mutagen sync list: ${parsed}`, { res, parsed })
  }

  return parsed
}

export const mutagenCliSpec: PluginToolSpec = {
  name: "mutagen",
  description: "The mutagen synchronization tool.",
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_darwin_amd64_v0.15.0.tar.gz",
      sha256: "370bf71e28f94002453921fda83282280162df7192bd07042bf622bf54507e3f",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_darwin_arm64_v0.15.0.tar.gz",
      sha256: "a0a7be8bb37266ea184cb580004e1741a17c8165b2032ce4b191f23fead821a0",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_linux_amd64_v0.15.0.tar.gz",
      sha256: "e8c0708258ddd6d574f1b8f514fb214f9ab5d82aed38dd8db49ec10956e5063a",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_windows_amd64_v0.15.0.zip",
      sha256: "fdae26b43cc418b2525a937a1613bba36e74ea3dde4dbec3512a9abd004def95",
      extract: {
        format: "zip",
        targetPath: "mutagen.exe",
      },
    },
  ],
}

export const mutagenCli = new PluginTool(mutagenCliSpec)

/**
 * Returns true if the given sync point is a filesystem path that exists.
 */
async function isValidLocalPath(syncPoint: string) {
  return pathExists(syncPoint)
}

function formatSyncConflict(sourceDescription: string, targetDescription: string, conflict: SyncConflict): string {
  return dedent`
    Sync conflict detected at path ${chalk.white(
      conflict.root
    )} in sync from ${sourceDescription} to ${targetDescription}.

    Until the conflict is resolved, the conflicting paths will not be synced.

    If conflicts come up regularly at this destination, you may want to use either the ${chalk.white(
      "one-way-replica"
    )} or ${chalk.white("one-way-replica-reverse")} sync modes instead.

    See the code synchronization guide for more details: ${chalk.white(syncGuideLink + "#sync-modes")}`
}

/**
 * Converts an octal permission mask to string.
 */
function modeToString(mode: number) {
  return "0" + mode.toString(8)
}
