/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { FSWatcher } from "chokidar"
import { watch } from "chokidar"
import type { Log } from "./logger/log-entry.js"
import EventEmitter2 from "eventemitter2"
import type { EventBus } from "./events/events.js"
import type { Stats } from "fs"
import { join } from "path"
import stringify from "json-stringify-safe"
import type { EventName } from "chokidar/handler.js"

let watcher: Watcher | undefined

interface SubscribedPath {
  type: "config"
  path: string
}

interface Subscriber {
  eventBus: EventBus
  paths: Map<string, SubscribedPath>
}

interface WatcherParams {
  log: Log
}

/**
 * Wrapper around the Chokidar file watcher. This is a singleton class that manages multiple subscribers.
 *
 * Individual Garden instances should subscribe()
 */
export class Watcher extends EventEmitter2.EventEmitter2 {
  private log: Log
  private subscribers: Subscriber[]
  public ready: boolean
  private fsWatcher: FSWatcher

  private constructor({ log }: WatcherParams) {
    super()
    this.log = log.root.createLog() // We want internal logs to go to the root logger
    this.subscribers = []
    this.ready = false

    this.log.debug(`Watcher: Initializing`)

    this.log.debug(`Watcher: Starting FSWatcher`)
    this.fsWatcher = watch([], {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    })

    this.fsWatcher
      .on("error", (err: unknown) => {
        this.log.error(`Watcher: Error - ${err}`)
        this.emit("error", err)
      })
      .once("ready", () => {
        this.log.debug(`Watcher: Ready`)
        this.emit("ready")
        this.ready = true
      })
      .on("all", (name, path, payload) => {
        this.log.silly(() => `FSWatcher event: ${name} ${path} ${stringify(payload)}`)
        this.routeEvent(name, path, payload)
      })
  }

  static getInstance(params: WatcherParams) {
    if (!watcher) {
      watcher = new Watcher(params)
    }
    return watcher
  }

  /**
   * Subscribes the given EventBus to watch events for the given paths.
   * If an existing subscription exists, the paths are added to the previously subscribed paths.
   * If you want to remove the previously subscribed paths, use `unsubscribe()` first.
   */
  subscribe(eventBus: EventBus, paths: SubscribedPath[]) {
    let subscriber = this.getSubscriber(eventBus)

    if (!subscriber) {
      subscriber = { eventBus, paths: new Map() }
      this.subscribers.push(subscriber)
    }

    for (const path of paths) {
      subscriber.paths.set(path.path, path)
    }

    this.log.debug(`Watcher: Add ${paths.length} paths`)
    this.fsWatcher.add(paths.map((p) => p.path))
  }

  /**
   * Unsubscribes the given EventBus from all or given path updates.
   * If no paths are specified, the EventBus is fully unsubscribed.
   */
  unsubscribe(eventBus: EventBus, paths?: SubscribedPath[]) {
    const subscriber = this.getSubscriber(eventBus)

    if (!subscriber) {
      return
    }

    if (paths) {
      for (const path of paths) {
        subscriber.paths.delete(path.path)
      }
    } else {
      subscriber.paths.clear()
    }

    if (subscriber.paths.size === 0) {
      // No paths subscribed, remove the subscriber
      this.subscribers.splice(this.subscribers.indexOf(subscriber))
    }

    const orphaned = this.getWatchedPaths()

    for (const s of this.subscribers) {
      for (const { path } of s.paths.values()) {
        orphaned.delete(path)
      }
    }

    this.log.debug(`Cleaning up ${orphaned.size} paths from watcher`)
    this.fsWatcher.unwatch(Array.from(orphaned.values()))
  }

  getSubscriber(eventBus: EventBus) {
    for (const subscriber of this.subscribers) {
      if (subscriber.eventBus === eventBus) {
        return subscriber
      }
    }
    return
  }

  getWatchedPaths() {
    return new Set(
      Object.entries(this.fsWatcher.getWatched()).flatMap(([dir, filenames]) => filenames.map((f) => join(dir, f)))
    )
  }

  /**
   * Permanently stop the watcher. This should only be done at the end of a process.
   */
  async stop() {
    this.log.debug(`Watcher: Cleaning up`)
    this.fsWatcher.removeAllListeners()
    this.subscribers = []
    await this.fsWatcher.close()
    this.log.debug(`Watcher: Cleaned up`)
  }

  private routeEvent(_eventName: EventName, path: string, _stats?: Stats) {
    for (const subscriber of this.subscribers) {
      const match = subscriber.paths.get(path)
      if (match?.type === "config") {
        subscriber.eventBus.emit("configChanged", { path })
      }
    }
  }
}
