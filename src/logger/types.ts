/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as nodeEmoji from "node-emoji"

import { GardenError } from "../exceptions"

export type EmojiName = keyof typeof nodeEmoji.emoji

export enum LogLevel {
  silent = -1,
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

export enum LoggerType {
  basic = "basic",
  fancy = "fancy",
  quiet = "quiet",
}

// Defines entry style and format (only one available style at the moment)
export enum EntryStyle {
  activity = "activity",
  error = "error",
}

// Icon to show when activity is done (values are the keys used in log-symbols package)
export enum LogSymbolType {
  error = "error",
  info = "info",
  success = "success",
  warn = "warning",
  empty = "empty",
}

export enum EntryStatus {
  ACTIVE = "active",
  DONE = "done",
  ERROR = "error",
  SUCCESS = "success",
  WARN = "warn",
}

export interface HeaderOpts {
  emoji?: string
  command: string
}

export interface LogEntryOpts {
  msg?: string | string[]
  section?: string
  emoji?: EmojiName
  symbol?: LogSymbolType
  entryStyle?: EntryStyle
  append?: boolean
  notOriginatedFromLogger?: boolean
  showDuration?: boolean
  error?: GardenError | Error
}
