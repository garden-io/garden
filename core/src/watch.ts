/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { watch, FSWatcher } from "chokidar"
import { Garden } from "./garden"
import { Log } from "./logger/log-entry"
import { InternalError } from "./exceptions"
import { EventEmitter } from "events"

let watcher: FSWatcher | undefined

/**
 * Wrapper around the Chokidar file watcher. Emits events on `garden.events` when Garden config files are changed.
 *
 * This needs to be enabled by calling the `.start()` method, and stopped with the `.stop()` method.
 *
 * Note: Unlike the 0.12-era Watcher, this implementation only watches a specific list of paths (not entire
 * directories). This is done both for performance and simplicity. If we want to introduce functionality that benefits
 * from watching all of an action's included sources, we can revisit & adapt an older version of this class from the
 * Git history.
 */
export class Watcher extends EventEmitter {
  private garden: Garden
  private log: Log
  private configPaths: string[]
  private watcher?: FSWatcher
  public ready: boolean

  constructor({
    garden,
    log,
    configPaths
  }: {
    garden: Garden
    log: Log
    configPaths: string[]
  }) {
    super()
    this.garden = garden
    this.log = log
    this.configPaths = configPaths
    this.ready = false
    this.start()
  }

  async stop() {
    if (this.watcher) {
      this.log.debug(`Watcher: Clearing handlers`)
      this.watcher.removeAllListeners()
      // We re-use the FSWatcher instance on Mac to avoid fsevents segfaults, but don't need to on other platforms
      if (process.platform !== "darwin") {
        await this.watcher.close()
      }
      delete this.watcher
    }
  }

  start() {
    this.log.debug(`Watcher: Watching paths ${this.configPaths.join(", ")}`)

    if (!this.watcher) {
      // We keep a single instance of FSWatcher to avoid segfault issues on Mac
      if (watcher) {
        this.log.debug(`Watcher: Using existing FSWatcher`)
        this.watcher = watcher

        this.log.debug(`Watcher: Watch ${this.configPaths}`)
        watcher.add(this.configPaths)

        this.ready = true

        // Emit after the call returns
        setTimeout(() => {
          watcher!.emit("ready")
        }, 100)
      } else {
        // Make sure that fsevents works when we're on macOS. This has come up before without us noticing, which has
        // a dramatic performance impact, so it's best if we simply throw here so that our tests catch such issues.
        if (process.platform === "darwin") {
          try {
            require("fsevents")
          } catch (error) {
            throw new InternalError(`Unable to load fsevents module: ${error}`, {
              error,
            })
          }
        }

        this.log.debug(`Watcher: Starting FSWatcher`)
        this.watcher = watch(this.configPaths, {
          ignoreInitial: true,
          ignorePermissionErrors: true,
          persistent: true,
          awaitWriteFinish: {
            stabilityThreshold: 300,
            pollInterval: 100,
          },
        })

        if (process.platform === "darwin") {
          // We re-use the FSWatcher instance on Mac to avoid fsevents segfaults, but don't need to on other platforms
          watcher = this.watcher
        }
      }

      this.watcher
        .on("change", this.makeFileChangedHandler())
        .on("ready", () => {
          this.emit("ready")
          this.ready = true
        })
        .on("error", (err) => {
          this.emit("error", err)
        })
        .on("all", (name, path, payload) => {
          this.emit(name, path, payload)
          this.log.silly(`FSWatcher event: ${name} ${path} ${JSON.stringify(payload)}`)
        })
    }
  }

  private makeFileChangedHandler() {
    return (path: string) => {
      this.log.silly(`Watcher: File ${path} modified`)
      this.garden.events.emit("configChanged", { path })
    }
  }
}
