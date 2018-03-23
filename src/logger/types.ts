import * as nodeEmoji from "node-emoji"

type EmojiName = keyof typeof nodeEmoji.emoji

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
  development = "development",
  test = "test",
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
  originIsNotLogger?: boolean
  showDuration?: boolean
  error?: Error
}
