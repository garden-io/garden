import {
  LogLevel,
} from "../types"

import { LogEntry, RootLogNode } from "../index"

export interface WriterConfig {
  level?: LogLevel
}

export abstract class Writer {
  public level: LogLevel | undefined

  constructor({ level }: WriterConfig = {}) {
    this.level = level
  }

  abstract render(...args): string | string[] | null
  abstract onGraphChange(entry: LogEntry, rootLogNode: RootLogNode): void
  abstract stop(): void
}
