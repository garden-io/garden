/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { join } from "path"
import { mkdirp, remove, removeSync } from "fs-extra"
import respawn from "respawn"
import { LogEntry } from "../../logger/log-entry"
import { PluginToolSpec } from "../../types/plugin/tools"
import { PluginTool } from "../../util/ext-tools"
import { makeTempDir, TempDirectory } from "../../util/fs"
import { registerCleanupFunction } from "../../util/util"

const maxRestarts = 10

let daemonProc: any
let mutagenTmp: TempDirectory

registerCleanupFunction("kill-sync-daaemon", () => {
  stopDaemonProc()
  mutagenTmp && removeSync(mutagenTmp.path)
})

export async function killSyncDaemon(clearTmpDir = true) {
  stopDaemonProc()
  if (mutagenTmp) {
    await remove(join(mutagenTmp.path, "mutagen.yml.lock"))
  }

  if (clearTmpDir) {
    mutagenTmp && (await remove(mutagenTmp.path))
  }
}

function stopDaemonProc() {
  try {
    daemonProc?.stop()
  } catch {}
}

export async function ensureMutagenDaemon(log: LogEntry, mutagen: PluginTool) {
  if (!mutagenTmp) {
    mutagenTmp = await makeTempDir()
  }

  const dataDir = mutagenTmp.path

  if (daemonProc && daemonProc.status === "running") {
    return dataDir
  }

  const mutagenPath = await mutagen.getPath(log)

  await mkdirp(dataDir)

  daemonProc = respawn([mutagenPath, "daemon", "run"], {
    cwd: dataDir,
    name: "mutagen",
    env: {
      MUTAGEN_DATA_DIRECTORY: dataDir,
    },
    maxRestarts,
    sleep: 1000,
    kill: 500,
    stdio: "pipe",
    fork: false,
  })

  const crashMessage = `Synchronization daemon has crashed ${maxRestarts} times. Aborting.`

  daemonProc.on("crash", () => {
    log.root.warn(chalk.yellow(crashMessage))
  })

  // TODO: Reenable. This log line creates too much noise when daemon restarts are required during deployments
  // (see dev-mode.ts).
  // daemonProc.on("exit", (code: number) => {
  //   if (code !== 0) {
  //     log.root.warn(chalk.yellow(`Synchronization daemon exited with code ${code}.`))
  //   }
  // })

  daemonProc.on("stdout", (data: Buffer) => {
    log.silly({ section: "mutagen", msg: data.toString() })
  })
  daemonProc.on("stderr", (data: Buffer) => {
    log.silly({ section: "mutagen", msg: data.toString() })
  })

  return new Promise<string>((resolve, reject) => {
    let resolved = false

    daemonProc.once("spawn", () => {
      if (resolved) {
        return
      }

      setTimeout(() => {
        if (daemonProc.status === "running") {
          resolved = true
          resolve(dataDir)
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
        "https://github.com/garden-io/mutagen/releases/download/v0.12.0-garden-alpha1/mutagen_darwin_amd64_v0.12.0-beta2.tar.gz",
      sha256: "de45df05e6eddb4ad9672da8240ca43302cd901d8d58b627ca8a26c94d1f24bf",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url:
        "https://github.com/garden-io/mutagen/releases/download/v0.12.0-garden-alpha1/mutagen_linux_amd64_v0.12.0-beta2.tar.gz",
      sha256: "b423dc5fd396b174a53dcf348ccc229169976a3ea390a2ce4ba9d7a3d13c2619",
      extract: {
        format: "tar",
        targetPath: "mutagen",
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url:
        "https://github.com/garden-io/mutagen/releases/download/v0.12.0-garden-alpha1/mutagen_windows_amd64_v0.12.0-beta2.tar.gz",
      sha256: "f526221a1078cbad48115b0d02c7e2c0118f2b3d46778d19717c654c7096f242",
      extract: {
        format: "tar",
        targetPath: "mutagen.exe",
      },
    },
  ],
}
