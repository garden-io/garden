/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Command } from "../commands/base.js"
import type { Garden } from "../garden.js"

export interface MonitorBaseParams {
  garden: Garden
}

export abstract class Monitor {
  public subscribers: Command[]
  protected garden: Garden

  constructor(params: MonitorBaseParams) {
    this.subscribers = []
    this.garden = params.garden
  }

  abstract type: string

  abstract key(): string
  abstract description(): string

  abstract start(): Promise<{}>
  abstract stop(): Promise<{}>

  subscribe(subscriber: Command) {
    this.subscribers.push(subscriber)
  }

  unsubscribe(subscriber: Command) {
    this.subscribers = this.subscribers.filter((sub) => sub !== subscriber)
  }

  unsubscribeAll() {
    this.subscribers = []
  }

  id() {
    return `"type=${this.type}--key=${this.key()}`
  }
}
