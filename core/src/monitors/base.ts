/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Command } from "../commands/base"
import type { PrimitiveMap } from "../config/common"
import type { Garden } from "../garden"

export interface MonitorBaseParams {
  garden: Garden
  command: Command
}

export type MonitorKey = PrimitiveMap

export abstract class Monitor {
  public command: Command
  protected garden: Garden

  constructor(params: MonitorBaseParams) {
    this.command = params.command
    this.garden = params.garden
  }

  abstract type: string

  abstract key(): string
  abstract description(): string

  abstract start(): Promise<{}>
  abstract stop(): Promise<{}>

  id() {
    return `"type=${this.type}--key=${this.key()}`
  }
}
