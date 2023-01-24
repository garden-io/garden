/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import chalk from "chalk"
import { join } from "path"
import { chmod, ensureSymlink, mkdirp, pathExists, remove, removeSync, writeFile } from "fs-extra"
import respawn from "respawn"
import { LogEntry } from "../../logger/log-entry"
import { PluginToolSpec } from "../../types/plugin/tools"
import { PluginTool } from "../../util/ext-tools"
import { makeTempDir } from "../../util/fs"
import { registerCleanupFunction, sleep } from "../../util/util"
import { GardenBaseError } from "../../exceptions"
import { prepareConnectionOpts } from "./kubectl"
import { KubernetesPluginContext } from "./config"
import pRetry from "p-retry"
import { devModeGuideLink } from "./dev-mode"
import dedent from "dedent"
import { PluginContext } from "../../plugin-context"
import Bluebird from "bluebird"
import { LATEST_MUTAGEN_DATA_DIR_NAME, MUTAGEN_DIR_NAME } from "../../constants"
import EventEmitter from "events"
import { ExecaReturnValue } from "execa"

const maxRestarts = 10
const monitorDelay = 2000
const mutagenLogSection = "<mutagen>"
const crashMessage = `Synchronization daemon has crashed ${maxRestarts} times. Aborting.`

export const mutagenAgentPath = "/.garden/mutagen-agent"

/**
 * Types are missing for the "respawn" package so adding some basic ones here.
 */
interface DaemonProc extends EventEmitter {
  status: string
  start: () => {}
  stop: () => {}
}

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
  "halted-on-root-emptied": "Sync halted due to one-sided root emptying",
  "halted-on-root-deletion": "Sync halted due to root deletion",
  "halted-on-root-type-change": "Sync halted due to root type change",
  "connecting-alpha": "Sync connected to alpha",
  "connecting-beta": "Sync connected to beta",
  "watching": "Watching for changes",
  "scanning": "Scanning files to sync",
  "waiting-for-rescan": "Waiting 5 seconds for sync rescan",
  "reconciling": "Reconciling sync changes",
  "staging-alpha": "Staging files to sync on alpha",
  "staging-beta": "Staging files to sync on beta",
  "transitioning": "Syncing changes...",
  "saving": "Saving sync archive",
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

type ActiveSyncs = { [key: string]: ActiveSync }

export class MutagenError extends GardenBaseError {
  type = "mutagen"
}

/**
 * A class for managing the Mutagen daemon process.
 *
 * Use MutagenDaemon.start() to start the daemon process. The call returns the class instance.
 *
 * TODO: This is currently a singleton which is not ideal for testing. After v0.13 we should
 * refactor this so that it's a normal class that's attached to the Garden instance. This
 * will allow us to call it via something like `garden.sync.createSession()` and to easily
 * fake Mutagen in tests.
 */
export class MutagenDaemon {
  private static instance?: MutagenDaemon

  private ctx: PluginContext
  private mutagen: PluginTool
  private monitorInterval: NodeJS.Timeout | null
  private log: LogEntry
  private daemonProc: DaemonProc
  private tmpSymlinkPath: string
  private dataDir: string
  private mutagenTmpSymlinkPath: string
  private syncStatusLines: { [sessionName: string]: LogEntry }
  private activeSyncs: ActiveSyncs
  public configLock: AsyncLock

  private constructor({
    daemonProc,
    dataDir,
    tmpSymlinkPath,
    configLock,
    mutagen,
    ctx,
    log,
  }: {
    daemonProc: any
    dataDir: string
    tmpSymlinkPath: string
    configLock: AsyncLock
    mutagen: PluginTool
    ctx: PluginContext
    log: LogEntry
  }) {
    this.ctx = ctx
    this.mutagen = mutagen
    this.daemonProc = daemonProc
    this.dataDir = dataDir
    this.log = log
    this.tmpSymlinkPath = tmpSymlinkPath
    this.configLock = configLock
    this.activeSyncs = {}
    this.syncStatusLines = {}
    this.monitorInterval = null

    registerCleanupFunction("kill-sync-daaemon", () => {
      this.stopDaemonProc()
      try {
        removeSync(this.dataDir)
      } catch {}
      try {
        removeSync(this.tmpSymlinkPath)
      } catch {}
    })

    this.startMonitor()
  }

  /**
   * Returns an instance of the class if it already exists. Otherwise starts
   * the Mutagen daemon process and then returns the class instance.
   */
  static async start({ ctx, log }: { ctx: PluginContext; log: LogEntry }) {
    if (!MutagenDaemon.instance) {
      const dataDir = (await makeTempDir()).path
      const tmpSymlinkPath = join(dataDir, ctx.sessionId)
      const configLock = new AsyncLock()
      const mutagen = new PluginTool(mutagenCliSpec)

      const daemonProc = await MutagenDaemon.ensureDaemon({
        ctx,
        log,
        dataDir,
        tmpSymlinkPath,
        configLock,
        mutagen,
      })

      MutagenDaemon.instance = new MutagenDaemon({ daemonProc, dataDir, log, ctx, tmpSymlinkPath, configLock, mutagen })
    }

    return MutagenDaemon.instance
  }

  /**
   * Stop the daemon, remove the tmp data dir and clear the instance.
   */
  static async clearInstance() {
    if (MutagenDaemon.instance) {
      await MutagenDaemon.instance.killSyncDaemon(true)
    }
    MutagenDaemon.instance = undefined
  }

  static async ensureDaemon({
    ctx,
    log,
    dataDir,
    tmpSymlinkPath,
    configLock,
    mutagen,
  }: {
    ctx: PluginContext
    log: LogEntry
    dataDir: string
    tmpSymlinkPath: string
    configLock: AsyncLock
    mutagen: PluginTool
  }) {
    return configLock.acquire("start-daemon", async () => {
      const mutagenPath = await mutagen.getPath(log)

      await mkdirp(dataDir)

      // For convenience while troubleshooting, place a symlink to the temp directory under .garden/mutagen
      const mutagenDir = join(ctx.gardenDirPath, MUTAGEN_DIR_NAME)
      await mkdirp(mutagenDir)
      const latestSymlinkPath = join(mutagenDir, LATEST_MUTAGEN_DATA_DIR_NAME)

      try {
        await ensureSymlink(dataDir, tmpSymlinkPath, "dir")

        // Also, write a quick script to the data directory to make it easier to work with
        const scriptPath = join(dataDir, "mutagen.sh")
        await writeFile(
          scriptPath,
          dedent`
          #!/bin/sh
          export MUTAGEN_DATA_DIRECTORY='${dataDir}'
          export MUTAGEN_LOG_LEVEL=debug
          ${mutagenPath} "$@"
        `
        )
        await chmod(scriptPath, 0o755)

        // Always keep a "latest" link for convenience.
        // Need to remove existing data dir before symlinking again.
        await remove(latestSymlinkPath)
        await ensureSymlink(dataDir, latestSymlinkPath, "dir")
      } catch (err) {
        log.debug({ symbol: "warning", msg: `Unable to symlink mutagen data directory: ${err}` })
      }

      const daemonProc = respawn([mutagenPath, "daemon", "run"], {
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
      }) as DaemonProc

      daemonProc.on("crash", () => {
        log.warn(chalk.yellow(crashMessage))
      })

      daemonProc.on("exit", (code: number) => {
        if (code !== 0) {
          log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.yellow(`Synchronization daemon exited with code ${code}.`),
          })
          // Remove the lock file
          const daemonLockFilePath = join(dataDir, "daemon", "daemon.lock")
          removeSync(daemonLockFilePath)
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

      daemonProc.on("stdout", handleOutput)
      daemonProc.on("stderr", handleOutput)

      return new Promise<DaemonProc>((resolve, reject) => {
        let resolved = false

        daemonProc.on("spawn", () => {
          if (resolved) {
            log.info({
              symbol: "empty",
              section: mutagenLogSection,
              msg: chalk.green("Synchronization daemon re-started"),
            })
          }
        })

        daemonProc.once("spawn", () => {
          setTimeout(() => {
            if (daemonProc?.status === "running") {
              resolved = true
              resolve(daemonProc)
            }
          }, 500)
        })

        daemonProc.once("crash", () => {
          if (!resolved) {
            reject(crashMessage)
          }
        })

        daemonProc.start()
      })
    })
  }

  /**
   * Make sure the specified sync is active. Does nothing if a sync is already active with the same key.
   * (When configuration changes, the whole daemon is reset).
   */
  async ensureSync({
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
    if (this.activeSyncs[key]) {
      return
    }

    return this.configLock.acquire("configure", async () => {
      const active = await this.getActiveSyncSessions()
      const existing = active.find((s) => s.name === key)

      if (!existing) {
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

        // Might need to retry
        await pRetry(() => this.execCommand(["sync", "create", ...params]), {
          retries: 5,
          minTimeout: 1000,
          onFailedAttempt: (err) => {
            this.log.warn(
              `Failed to start sync from ${sourceDescription} to ${targetDescription}. ${err.retriesLeft} attempts left.`
            )
          },
        })

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
      }
    })
  }

  /**
   * Remove the specified sync (by name) from the sync daemon.
   */
  async terminateSync(key: string) {
    this.log.debug(`Terminating mutagen sync ${key}`)

    return this.configLock.acquire("configure", async () => {
      try {
        await this.execCommand(["sync", "terminate", key])
        delete this.activeSyncs[key]
      } catch (err) {
        // Ignore other errors, which should mean the sync wasn't found
        if (err.message.includes("unable to connect to daemon")) {
          throw err
        }
      }
    })
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
          this.log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.gray(
              `Could not flush mutagen session, retrying (attempt ${err.attemptNumber}/${err.retriesLeft})...`
            ),
          })
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
  async flushAllSyncs() {
    const active = await this.getActiveSyncSessions()
    await Bluebird.map(active, async (session) => {
      try {
        await this.flushSync(session.name)
      } catch (err) {
        this.log.warn(chalk.yellow(`Failed to flush sync '${session.name}: ${err.message}`))
      }
    })
  }

  /**
   * List all Mutagen sync sessions.
   */
  private async getActiveSyncSessions(): Promise<SyncSession[]> {
    const res = await this.execCommand(["sync", "list", "--template={{ json . }}"])
    return parseSyncListResult(res)
  }

  /**
   * Execute a Mutagen command with retries. Restarts the daemon process
   * between retries if Mutagen is unable to connect to it.
   */
  private async execCommand(args: string[]) {
    let loops = 0
    const maxRetries = 10

    while (true) {
      try {
        const res = this.mutagen.exec({
          cwd: this.dataDir,
          args,
          log: this.log,
          env: getMutagenEnv(this.dataDir),
        })
        return res
      } catch (err) {
        const unableToConnect = err.message.match(/unable to connect to daemon/)
        if (unableToConnect && loops < 10) {
          loops += 1
          this.log.warn({
            symbol: "empty",
            section: mutagenLogSection,
            msg: chalk.gray(`Could not connect to sync daemon, retrying (attempt ${loops}/${maxRetries})...`),
          })
          // TODO: Add a comment here
          await this.restartDaemonProc()
          await sleep(2000 + loops * 500)
        } else {
          throw err
        }
      }
    }
  }

  private async killSyncDaemon(clearTmpDir = true) {
    this.stopDaemonProc()
    await remove(join(this.dataDir, "mutagen.yml.lock"))

    if (clearTmpDir) {
      await remove(this.dataDir)
      this.mutagenTmpSymlinkPath && (await remove(this.mutagenTmpSymlinkPath))
    }

    this.activeSyncs = {}
  }

  private async restartDaemonProc() {
    await this.killSyncDaemon(false)
    this.daemonProc = await MutagenDaemon.ensureDaemon({
      ctx: this.ctx,
      log: this.log,
      dataDir: this.dataDir,
      mutagen: this.mutagen,
      configLock: this.configLock,
      tmpSymlinkPath: this.tmpSymlinkPath,
    })
  }

  private checkMutagen() {
    this.getActiveSyncSessions()
      .then((sessions) => {
        for (const session of sessions) {
          const sessionName = session.name
          const activeSync = this.activeSyncs[sessionName]
          if (!activeSync) {
            continue
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
              this.log.warn({ symbol: "warning", section, msg: chalk.yellow(problem) })
            }
          }

          if (session.alpha.connected && !activeSync.sourceConnected) {
            this.log.info({
              symbol: "info",
              section,
              msg: chalk.gray(`Connected to sync source ${sourceDescription}`),
            })
            activeSync.sourceConnected = true
          }

          if (session.beta.connected && !activeSync.targetConnected) {
            this.log.info({
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
            this.log.info({
              symbol: "success",
              section,
              msg: chalk.gray(`Completed initial sync ${description}`),
            })
            activeSync.initialSyncComplete = true
          }

          if (!this.syncStatusLines[sessionName]) {
            this.syncStatusLines[sessionName] = this.log.placeholder()
          }
          let statusMsg: string | undefined

          if (syncCount > activeSync.lastSyncCount && !isInitialSync) {
            const time = new Date().toLocaleTimeString()
            statusMsg = `Synchronized ${description} at ${time})`
          } else if (activeSync.paused && !session.paused) {
            statusMsg = `Sync resumed`
          } else if (!activeSync.paused && session.paused) {
            statusMsg = `Sync paused`
          } else if (session.status && session.status !== activeSync.lastStatus) {
            statusMsg = mutagenStatusDescriptions[session.status]
          }

          if (statusMsg) {
            this.syncStatusLines[sessionName].setState({
              symbol: "info",
              section,
              msg: chalk.gray(statusMsg),
            })
          }

          activeSync.lastSyncCount = syncCount
          activeSync.lastProblems = problems
          activeSync.lastStatus = session.status
          activeSync.paused = session.paused
        }
      })
      .catch((err) => {
        this.log.debug({
          symbol: "warning",
          section: mutagenLogSection,
          msg: "Unable to get status from sync daemon: " + err.message,
        })
      })
  }

  private startMonitor() {
    if (!this.monitorInterval) {
      this.monitorInterval = setInterval(() => this.checkMutagen(), monitorDelay)
    }
  }

  private stopDaemonProc() {
    try {
      this.daemonProc.stop()
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
    MUTAGEN_DISABLE_AUTOSTART: "1",
  }
}

export async function parseSyncListResult(res: ExecaReturnValue) {
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

export async function getKubectlExecDestination({
  ctx,
  log,
  namespace,
  containerName,
  resourceName,
  targetPath,
}: {
  ctx: KubernetesPluginContext
  log: LogEntry
  namespace: string
  containerName: string
  resourceName: string
  targetPath: string
}) {
  const kubectl = ctx.tools["kubernetes.kubectl"]
  const kubectlPath = await kubectl.getPath(log)

  const connectionOpts = prepareConnectionOpts({
    provider: ctx.provider,
    namespace,
  })

  const command = [
    kubectlPath,
    "exec",
    "-i",
    ...connectionOpts,
    "--container",
    containerName,
    resourceName,
    "--",
    mutagenAgentPath,
    "synchronizer",
  ]

  return `exec:'${command.join(" ")}':${targetPath}`
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
      url:
        "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_darwin_amd64_v0.15.0.tar.gz",
      sha256: "370bf71e28f94002453921fda83282280162df7192bd07042bf622bf54507e3f",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url:
        "https://github.com/garden-io/mutagen/releases/download/v0.15.0-garden-1/mutagen_darwin_arm64_v0.15.0.tar.gz",
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

    See the code synchronization guide for more details: ${chalk.white(devModeGuideLink + "#sync-modes")}`
}

/**
 * Converts an octal permission mask to string.
 */
function modeToString(mode: number) {
  return "0" + mode.toString(8)
}
