/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import dedent from "dedent"
import type EventEmitter from "events"
import type { ExecaReturnValue } from "execa"
import fsExtra from "fs-extra"
import { hashSync } from "hasha"
import pRetry, { type FailedAttemptError } from "p-retry"
import { join } from "path"
import respawn from "respawn"
import split2 from "split2"
import { GARDEN_GLOBAL_PATH, MUTAGEN_DIR_NAME } from "./constants.js"
import { ChildProcessError, GardenError } from "./exceptions.js"
import pMemoize from "./lib/p-memoize.js"
import type { Log } from "./logger/log-entry.js"
import type { WrappedFromGarden } from "./plugin-context.js"
import type { PluginToolSpec } from "./plugin/tools.js"
import { TypedEventEmitter } from "./util/events.js"
import { PluginTool } from "./util/ext-tools.js"
import { deline } from "./util/string.js"
import { registerCleanupFunction, sleep } from "./util/util.js"
import type { OctalPermissionMask } from "./plugins/kubernetes/types.js"
import { styles } from "./logger/styles.js"
import { dirname } from "node:path"
import { makeDocsLinkStyled } from "./docs/common.js"
import { syncGuideRelPath } from "./plugins/kubernetes/constants.js"

const { mkdirp, pathExists } = fsExtra

const maxRestarts = 10
const mutagenLogSection = "<mutagen>"
const crashMessage = `Synchronization monitor has crashed ${maxRestarts} times. Aborting.`

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

export class MutagenError extends GardenError {
  type = "mutagen"
}

interface MutagenDaemonParams {
  ctx: WrappedFromGarden
  log: Log
}

interface MutagenMonitorParams {
  log: Log
  dataDir: string
}

const monitorLock = new AsyncLock()
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

      const mutagenOpts = [mutagenPath, "sync", "monitor", "--template", "{{ json . }}", "--long"]
      log.silly(() => `Spawning mutagen using respawn: "${mutagenOpts.join(" ")}"`)

      const proc = respawn(mutagenOpts, {
        cwd: dataDir,
        name: "mutagen",
        env: getMutagenEnv({ dataDir, logLevel: "debug" }, log),
        maxRestarts,
        sleep: 3000,
        kill: 500,
        stdio: "pipe",
        fork: false,
      }) as MonitorProc

      this.proc = proc

      proc.on("crash", () => {
        log.warn(crashMessage)
      })

      let monitorFailureLogged = false
      proc.on("exit", (code: number) => {
        if (code && code !== 0) {
          log.warn(`Synchronization monitor exited with code ${code}.`)
          if (!monitorFailureLogged) {
            logMutagenDaemonWarning(log)
            monitorFailureLogged = true
          }
        }
      })

      const handleOutput = (data: Buffer) => {
        const str = data.toString().trim()
        // This is a little dumb, to detect if the log line starts with a timestamp, but ya know...
        // it'll basically work for the next 979 years :P.
        const msg = styles.primary(str.startsWith("2") ? str.split(" ").slice(3).join(" ") : str)
        if (msg.includes("Unable") && lastDaemonError !== msg) {
          log.warn(msg)
          // Make sure we don't spam with repeated messages
          lastDaemonError = msg
        } else {
          log.silly({
            symbol: "empty",
            msg,
          })
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
              msg: "Mutagen monitor re-started",
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

function logMutagenDaemonWarning(log: Log) {
  const daemonStopCommand = `garden util mutagen daemon stop`
  const deleteEnvironmentCommand = `garden cleanup namespace`
  const redeploySyncCommand = `garden deploy --sync`
  const killProcessesCommand = `kill -9 $(pgrep mutagen)`

  log.warn(
    deline`
    It looks like the sync daemon might have been changed to a different version.\n

    Therefore the sync daemon needs to be restarted, current mutagen processes stopped and the affected deploys must be redeployed.\n
    Please, stop this command and follow the instructions below.\n

    1. Stop the active sync daemon by running this command ${styles.accent(styles.bold("from the project root directory"))}:\n

    ${styles.command(daemonStopCommand)}\n

    2. Kill all mutagen processes on your machine by running this command\n

    ${styles.command(killProcessesCommand)}\n

    3. Redeploy the affected deploys by running the following commands (specify the action names if necessary):\n

    ${styles.command(deleteEnvironmentCommand)}\n

    ${styles.command(redeploySyncCommand)}\n

    Please see the Troubleshooting docs for more details: ${makeDocsLinkStyled("guides/code-synchronization", "#restarting-sync-daemon")}\n`
  )
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

  constructor(params: MutagenDaemonParams) {
    this.log = params.log
    this.configLock = new AsyncLock()
    this.dataDir = getMutagenDataDir(params)
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
      const syncLog = this.log.createLog({ name: section, origin: "sync" })

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
      const description = `from ${styles.highlight(sourceDescription)} to ${styles.highlight(targetDescription)}`
      const isInitialSync = activeSync.lastSyncCount === 0

      // Mutagen resets the sync count to zero after resuming from a sync paused
      // so we keep track of whether the initial sync has completed so that we
      // don't log it multiple times.
      if (syncCount > activeSync.lastSyncCount && !activeSync.initialSyncComplete) {
        syncLog.info({
          symbol: "success",
          msg: `Completed initial sync ${description}`,
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
        syncLog.info(statusMsg)
        activeSync.lastStatusMsg = statusMsg
      }

      activeSync.lastSyncCount = syncCount
      activeSync.lastProblems = problems
      activeSync.lastStatus = session.status
      activeSync.paused = session.paused
    }
  }

  async ensureDaemonProc() {
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

      const active = await this.getActiveSyncSessions()
      const existing = active.find((s) => s.name === key)

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

          // print this only after the first failure
          if (err.attemptNumber === 1) {
            const isMutagenForkError = (error: FailedAttemptError) => {
              const msg = error.message.toLowerCase()
              return (
                // this happens when switching from the old sync machinery to the new one
                msg.includes("ssh: could not resolve hostname") ||
                // this happens in the opposite scenario
                msg.includes("unknown or unsupported protocol") ||
                // this happens in any way of changing sync modes and when:
                // 1. the old sync daemon is stopped
                // 2. the target deploy action is not redeployed with the new sync machinery,
                //    and `sync start` command is used
                msg.includes("version mismatch")
              )
            }

            if (isMutagenForkError(err)) {
              logMutagenDaemonWarning(log)
              throw err
            }
          }
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
      if (!(err instanceof ChildProcessError)) {
        throw err
      }
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
            styles.primary(
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
    const active = await this.getActiveSyncSessions()
    await Promise.all(
      active.map(async (session) => {
        try {
          await this.flushSync(session.name)
        } catch (err) {
          log.warn(`Failed to flush sync '${session.name}: ${err}`)
        }
      })
    )
  }

  /**
   * List all Mutagen sync sessions.
   */
  async getActiveSyncSessions(): Promise<SyncSession[]> {
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
          env: await getMutagenEnv({ dataDir: this.dataDir }, this.log),
        })
      } catch (err) {
        if (!(err instanceof ChildProcessError)) {
          throw err
        }
        const unableToConnect = err.message.match(/unable to connect to daemon/)
        if (unableToConnect && loops < 10) {
          loops += 1
          this.log.warn(
            styles.primary(`Could not connect to sync daemon, retrying (attempt ${loops}/${maxRetries})...`)
          )
          if (loops === 1) {
            // this happens in any way of changing sync modes and when:
            // 1. the old sync daemon is stopped
            // 2. the target deploy action is not redeployed with the new sync machinery,
            //    and `sync stop` command is used
            logMutagenDaemonWarning(this.log)
          }
          await this.ensureDaemonProc()
          await sleep(2000 + loops * 500)
        } else {
          throw err
        }
      }
    }
  }

  async terminateSyncs() {
    await Promise.all(
      Object.keys(this.activeSyncs).map(async (key) => {
        await this.execCommand(["sync", "terminate", key])
        delete this.activeSyncs[key]
      })
    )
  }

  async restartDaemonProc() {
    await this.stopDaemonProc()
    await this.ensureDaemonProc()
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
 * Returns mutagen data directory path based on the project dir.
 *
 * It always computes sha256 hash of a project dir path, uses first 9 characters of hash as directory name,
 * and creates a directory in $HOME/.garden/mutagen.
 *
 * This approach ensures that sync source path is never too long to get into one of the known issues with Mutagen,
 * the sync tool that we use as a main synchronization machinery.
 * The Mutagen daemon may fail if the source sync path is too long because of the Unix socket path length limitations.
 * See:
 * <ul>
 *   <li>https://github.com/garden-io/garden/issues/4527#issuecomment-1584286590</li>
 *   <li>https://github.com/mutagen-io/mutagen/issues/433#issuecomment-1440352501</li>
 *   <li>https://unix.stackexchange.com/questions/367008/why-is-socket-path-length-limited-to-a-hundred-chars/367012#367012</li>
 * </ul>
 */
export function getMutagenDataDir({ ctx, log }: MutagenDaemonParams) {
  const rawSyncPath = ctx.gardenDirPath
  const hash = hashSync(rawSyncPath, { algorithm: "sha256" }).slice(0, 9)
  const shortPath = join(GARDEN_GLOBAL_PATH, MUTAGEN_DIR_NAME, hash)
  log.debug(`The syncs will be managed from ${shortPath}.`)

  return shortPath
}

/**
 * This type declares the Mutagen env variable name in a single place,
 * instead of declaring them across the code.
 *
 * Some env vars are required to use Mutagen in Garden, and some are optional.
 * This type shapes the set of the Mutagen env vars that are used by Garden.
 */
type MutagenEnv = {
  MUTAGEN_DATA_DIRECTORY: string
  MUTAGEN_SSH_PATH?: string
  MUTAGEN_LOG_LEVEL?: string
}

type MutagenEnvValues = {
  dataDir: string
  logLevel?: string
}

export async function getMutagenEnv({ dataDir, logLevel }: MutagenEnvValues, log: Log): Promise<MutagenEnv> {
  const sshPath = await getMutagenSshPath(log)
  if (sshPath) {
    log.debug(`Mutagen will be used with the faux SSH transport located in ${sshPath}`)
  }
  const env: MutagenEnv = { MUTAGEN_DATA_DIRECTORY: dataDir, MUTAGEN_SSH_PATH: sshPath }
  if (!!logLevel) {
    env.MUTAGEN_LOG_LEVEL = logLevel
  }
  return env
}

export function parseSyncListResult(res: ExecaReturnValue): SyncSession[] {
  // TODO: validate further
  let parsed: any = []

  try {
    parsed = JSON.parse(res.stdout)
  } catch (err) {
    throw new MutagenError({
      message: dedent`
        Could not parse response from mutagen sync list: ${res.stdout}

        Full output:
        ${res.all}
        `,
    })
  }

  if (!Array.isArray(parsed)) {
    throw new MutagenError({
      message: dedent`
        Unexpected response from mutagen sync list: ${parsed}. Got: ${typeof parsed}

        Full output:
        ${res.all}
        `,
    })
  }

  return parsed
}

export const mutagenVersion = "0.18.1"

export const mutagenCliSpec: PluginToolSpec = {
  name: "mutagen",
  version: mutagenVersion,
  description: `The mutagen synchronization tool, v${mutagenVersion}`,
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/mutagen-io/mutagen/releases/download/v${mutagenVersion}/mutagen_darwin_amd64_v${mutagenVersion}.tar.gz`,
      sha256: "7d06f7d8fcfe90bc7e55cc834a2f2f20c2e0af9ea9bc35911fc4341ad56a9bbf",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/mutagen-io/mutagen/releases/download/v${mutagenVersion}/mutagen_darwin_arm64_v${mutagenVersion}.tar.gz`,
      sha256: "6f810416d9e5fc4fd5e18431146f8b3c5a2056ba5a24f76c1e66da86eb3257e2",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/mutagen-io/mutagen/releases/download/v${mutagenVersion}/mutagen_linux_amd64_v${mutagenVersion}.tar.gz`,
      sha256: "7735286c778cc438418209f24d03a64f3a0151c8065ef0fe079cfaf093af6f8f",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/mutagen-io/mutagen/releases/download/v${mutagenVersion}/mutagen_linux_arm64_v${mutagenVersion}.tar.gz`,
      sha256: "bcba735aebf8cbc11da9b3742118a665599ac697fa06bc5751cac8dcd540db8a",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/mutagen-io/mutagen/releases/download/v${mutagenVersion}/mutagen_windows_amd64_v${mutagenVersion}.zip`,
      sha256: "76f8223d5e6b607efdd9516473669ae5492e4f142887352d59bc6934d1f07a2d",
      extract: {
        format: "zip",
        targetPath: "mutagen.exe",
      },
    },
  ],
}

export const mutagenCli = new PluginTool(mutagenCliSpec)

const mutagenFauxSshVersion = "v0.0.1"
const mutagenFauxSshReleaseBaseUrl = "https://github.com/garden-io/mutagen-faux-ssh/releases/download/"

export const mutagenFauxSshSpec: PluginToolSpec = {
  name: "mutagen-faux-ssh",
  version: mutagenFauxSshVersion,
  description: "The faux SSH implementation to be used as SSH transport for Mutagen.",
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `${mutagenFauxSshReleaseBaseUrl}/${mutagenFauxSshVersion}/mutagen-faux-ssh-${mutagenFauxSshVersion}-darwin-amd64.tar.gz`,
      sha256: "2613c82c843ac5123c0fe380422781db9306862341ba94b76aa3c5c6268acf50",
      extract: {
        format: "tar",
        targetPath: "ssh",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `${mutagenFauxSshReleaseBaseUrl}/${mutagenFauxSshVersion}/mutagen-faux-ssh-${mutagenFauxSshVersion}-darwin-arm64.tar.gz`,
      sha256: "914db58ebaf093e7494c83ea0c21156a23216c1ce08ccab27f9973f6aa4d5c4d",
      extract: {
        format: "tar",
        targetPath: "ssh",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `${mutagenFauxSshReleaseBaseUrl}/${mutagenFauxSshVersion}/mutagen-faux-ssh-${mutagenFauxSshVersion}-linux-amd64.tar.gz`,
      sha256: "16588f55e614d9ccb77c933463207cd023101bd7234b5d0eecff0e57a98dd7b0",
      extract: {
        format: "tar",
        targetPath: "ssh",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `${mutagenFauxSshReleaseBaseUrl}/${mutagenFauxSshVersion}/mutagen-faux-ssh-${mutagenFauxSshVersion}-linux-arm64.tar.gz`,
      sha256: "c7645e615efc9e5139f8a281abb9acae61ea2ce2084ea25aa438438da3481167",
      extract: {
        format: "tar",
        targetPath: "ssh",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `${mutagenFauxSshReleaseBaseUrl}/${mutagenFauxSshVersion}/mutagen-faux-ssh-${mutagenFauxSshVersion}-windows-amd64.zip`,
      sha256: "f548d81eea994c0b21dbcfa77b671ea8cc897b66598303396a214ef0b0c53f08",
      extract: {
        format: "zip",
        targetPath: "ssh.exe",
      },
    },
  ],
}

export const mutagenFauxSsh = new PluginTool(mutagenFauxSshSpec)

/**
 * Returns the path to the location of the faux SSH Mutagen transport
 */
async function getMutagenSshPath(log: Log): Promise<string | undefined> {
  const fauxSshToolPath = await mutagenFauxSsh.ensurePath(log)
  // This must be the dir containing the faux SSH binary,
  // not the full path that includes the binary name.
  return dirname(fauxSshToolPath)
}

/**
 * Returns true if the given sync point is a filesystem path that exists.
 */
async function isValidLocalPath(syncPoint: string) {
  return pathExists(syncPoint)
}

function formatSyncConflict(sourceDescription: string, targetDescription: string, conflict: SyncConflict): string {
  return dedent`
    Sync conflict detected at path ${styles.highlight(
      conflict.root
    )} in sync from ${sourceDescription} to ${targetDescription}.

    Until the conflict is resolved, the conflicting paths will not be synced.

    If conflicts come up regularly at this destination, you may want to use either the ${styles.highlight(
      "one-way-replica"
    )} or ${styles.highlight("one-way-replica-reverse")} sync modes instead.

    See the code synchronization guide for more details: ${makeDocsLinkStyled(syncGuideRelPath, "#sync-modes")}`
}

/**
 * Converts an octal permission mask to string.
 */
function modeToString(mode: OctalPermissionMask) {
  return `0${mode.toString(8)}`
}
