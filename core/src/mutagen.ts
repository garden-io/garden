/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import Bluebird from "bluebird"
import chalk from "chalk"
import dedent from "dedent"
import EventEmitter from "events"
import { ExecaReturnValue } from "execa"
import { mkdirp, pathExists } from "fs-extra"
import hasha from "hasha"
import pRetry from "p-retry"
import { join } from "path"
import respawn from "respawn"
import split2 from "split2"
import { GARDEN_GLOBAL_PATH, MUTAGEN_DIR_NAME } from "./constants"
import { GardenBaseError } from "./exceptions"
import pMemoize from "./lib/p-memoize"
import { Log } from "./logger/log-entry"
import { PluginContext } from "./plugin-context"
import { PluginToolSpec } from "./plugin/tools"
import { syncGuideLink } from "./plugins/kubernetes/sync"
import { TypedEventEmitter } from "./util/events"
import { PluginTool } from "./util/ext-tools"
import { deline } from "./util/string"
import { registerCleanupFunction, sleep } from "./util/util"
import { emitNonRepeatableWarning } from "./warnings"
import { OctalPermissionMask } from "./plugins/kubernetes/types"

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

const restartInstructions = (description: string) => deline`
  Once you've examined the source and/or target directories and ${description}, you can
  restart the sync using the garden sync restart command, or by stopping and starting the sync
  using garden sync stop and then garden sync start.`

// This is basically copied from:
// https://github.com/mutagen-io/mutagen/blob/19e087599f187d85416d453cd50e2a9df1602132/pkg/synchronization/state.go
// with an updated description to match Garden's context.

export const mutagenStatusDescriptions = {
  "disconnected": "Sync disconnected",
  "halted-on-root-emptied": `Sync halted because either the source or target directory was emptied. ${restartInstructions(
    "made sure they're not empty"
  )}`,
  "halted-on-root-deletion": `Sync halted because either the source or target was deleted. ${restartInstructions(
    "made sure they exist"
  )}`,
  "halted-on-root-type-change": `Sync halted because either the source or target changed type (e.g. from a directory to a file or vice versa). ${restartInstructions(
    "made sure their type is what it should be"
  )}`,
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

export const haltedStatuses: MutagenStatus[] = [
  "halted-on-root-emptied",
  "halted-on-root-deletion",
  "halted-on-root-type-change",
]

export interface SyncConfig {
  alpha: string
  beta: string
  mode: keyof typeof mutagenModeMap
  ignore: string[]
  defaultOwner?: number | string
  defaultGroup?: number | string
  defaultFileMode?: OctalPermissionMask
  defaultDirectoryMode?: OctalPermissionMask
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
  lastStatusMsg?: string
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
 * We memoize this function for performance reasons, since we only need to create this dir once (assuming that the
 * user doesn't do anything silly like delete the <project-root>/.garden/mutagen directory while the command is
 * running).
 */
const ensureDataDir = pMemoize(async (dataDir: string) => {
  await mkdirp(dataDir)
})

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
    this.log = log.createLog({ name: mutagenLogSection })
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

      const log = this.log.createLog({ name: mutagenLogSection })

      const mutagenPath = await mutagenCli.ensurePath(log)
      const dataDir = this.dataDir

      await ensureDataDir(dataDir)

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
          log.warn(`Synchronization monitor exited with code ${code}.`)
        }
      })

      const handleOutput = (data: Buffer) => {
        const str = data.toString().trim()
        // This is a little dumb, to detect if the log line starts with a timestamp, but ya know...
        // it'll basically work for the next 979 years :P.
        const msg = chalk.gray(str.startsWith("2") ? str.split(" ").slice(3).join(" ") : str)
        if (msg.includes("Unable") && lastDaemonError !== msg) {
          log.warn(msg)
          // Make sure we don't spam with repeated messages
          lastDaemonError = msg
        } else {
          log.silly({ symbol: "empty", msg })
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

        proc.once("start", () => {
          log.verbose("Mutagen synchronization monitor started")
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

  constructor({ ctx, log }: MutagenDaemonParams) {
    this.log = log
    this.configLock = new AsyncLock()
    this.dataDir = getMutagenDataDir(ctx.gardenDirPath, log)
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
      const syncLog = this.log.createLog({ name: section })

      for (const problem of problems) {
        if (!activeSync.lastProblems.includes(problem)) {
          syncLog.warn(problem)
        }
      }

      if (session.alpha.connected && !activeSync.sourceConnected) {
        syncLog.info(`Connected to sync source ${sourceDescription}`)
        activeSync.sourceConnected = true
      }

      if (session.beta.connected && !activeSync.targetConnected) {
        syncLog.info({
          symbol: "success",
          msg: `Connected to sync target ${targetDescription}`,
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
        syncLog.info({
          symbol: "success",
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
        syncLog.info(`${syncLogPrefix} ${statusMsg}`)
        activeSync.lastStatusMsg = statusMsg
      }

      activeSync.lastSyncCount = syncCount
      activeSync.lastProblems = problems
      activeSync.lastStatus = session.status
      activeSync.paused = session.paused
    }
  }

  async ensureDaemon() {
    await this.execCommand(["daemon", "start"])
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
      await pRetry(() => this.execCommand(["sync", "create", ...params]), {
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
      await this.execCommand(["sync", "terminate", key])
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
  async flushSync(key: string) {
    await pRetry(() => this.execCommand(["sync", "flush", key]), {
      retries: 5,
      minTimeout: 1000,
      onFailedAttempt: async (err) => {
        const unableToFlush = err.message.match(/unable to flush session/)
        if (unableToFlush) {
          this.log.warn(
            chalk.gray(
              `Could not flush synchronization changes, retrying (attempt ${err.attemptNumber}/${err.retriesLeft})...`
            )
          )
        } else {
          throw err
        }
      },
    })

    await this.execCommand(["sync", "flush", key])
  }

  /**
   * Ensure all active syncs are completed.
   */
  async flushAllSyncs(log: Log) {
    const active = await this.getActiveSyncSessions(log)
    await Bluebird.map(active, async (session) => {
      try {
        await this.flushSync(session.name)
      } catch (err) {
        log.warn(chalk.yellow(`Failed to flush sync '${session.name}: ${err.message}`))
      }
    })
  }

  /**
   * List all Mutagen sync sessions.
   */
  async getActiveSyncSessions(log: Log): Promise<SyncSession[]> {
    const res = await this.execCommand(["sync", "list", "--template={{ json . }}"])
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
  private async execCommand(args: string[]) {
    let loops = 0
    const maxRetries = 10
    await ensureDataDir(this.dataDir)

    while (true) {
      try {
        return await mutagenCli.exec({
          cwd: this.dataDir,
          args,
          log: this.log,
          env: getMutagenEnv(this.dataDir),
        })
      } catch (err) {
        const unableToConnect = err.message.match(/unable to connect to daemon/)
        if (unableToConnect && loops < 10) {
          loops += 1
          this.log.warn(chalk.gray(`Could not connect to sync daemon, retrying (attempt ${loops}/${maxRetries})...`))
          await this.ensureDaemon()
          await sleep(2000 + loops * 500)
        } else {
          emitNonRepeatableWarning(
            this.log,
            `Consider making your Garden project path shorter. Syncing could fail because of Unix socket path length limitations. It's recommended that the Garden project path does not exceed ${MUTAGEN_DATA_DIRECTORY_LENGTH_LIMIT} characters. The actual value depends on the platform and the mutagen version.`
          )
          throw err
        }
      }
    }
  }

  async terminateSyncs() {
    await Bluebird.map(Object.keys(this.activeSyncs), async (key) => {
      await this.execCommand(["sync", "terminate", key])
      delete this.activeSyncs[key]
    })
  }

  async restartDaemonProc() {
    await this.stopDaemonProc()
    await this.ensureDaemon()
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

  private async stopDaemonProc() {
    try {
      await this.execCommand(["daemon", "stop"])
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

export interface SyncSession {
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

/**
 * Exceeding this limit may cause mutagen daemon failures because of the Unix socket path length limitations.
 * See
 * https://github.com/garden-io/garden/issues/4527#issuecomment-1584286590
 * https://github.com/mutagen-io/mutagen/issues/433#issuecomment-1440352501
 * https://unix.stackexchange.com/questions/367008/why-is-socket-path-length-limited-to-a-hundred-chars/367012#367012
 */
const MUTAGEN_DATA_DIRECTORY_LENGTH_LIMIT = 70

/**
 * Returns mutagen data directory path based on the project dir.
 * If the project path longer than `MUTAGEN_DATA_DIRECTORY_LENGTH_LIMIT`, it computes
 * hash of project dir path, uses first 9 characters of hash as directory name
 * and creates a directory in $HOME/.garden/mutagen.
 *
 * However, if the path is not longer than `MUTAGEN_DATA_DIRECTORY_LENGTH_LIMIT`, then
 * it uses the ./project-root/.garden/mutagen directory.
 */
export function getMutagenDataDir(path: string, log: Log) {
  if (path.length > MUTAGEN_DATA_DIRECTORY_LENGTH_LIMIT) {
    const hash = hasha(path, { algorithm: "sha256" }).slice(0, 9)
    const shortPath = join(GARDEN_GLOBAL_PATH, MUTAGEN_DIR_NAME, hash)
    log.verbose(
      `Your Garden project path looks too long, that might cause errors while starting the syncs. Garden will create a new directory to manage syncs at path: ${shortPath}.`
    )
    return shortPath
  }
  // if path is not too long, then use relative directory to the project
  return join(path, MUTAGEN_DIR_NAME)
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
    throw new MutagenError({
      message: `Could not parse response from mutagen sync list: ${res.stdout}`,
      detail: { res },
    })
  }

  if (!Array.isArray(parsed)) {
    throw new MutagenError({
      message: `Unexpected response from mutagen sync list: ${parsed}`,
      detail: { res, parsed },
    })
  }

  return parsed
}

export const mutagenCliSpec: PluginToolSpec = {
  name: "mutagen",
  version: "0.15.0",
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
function modeToString(mode: OctalPermissionMask) {
  return `0${mode.toString(8)}`
}
