import {
  LogLevel,
} from "../types"
import {
  formatForTerminal,
} from "../renderers"
import { LogEntry, RootLogNode } from "../index"
import { validate } from "../util"
import { Writer } from "./base"

export class BasicTerminalWriter extends Writer {
  public level: LogLevel

  render(entry: LogEntry, rootLogNode: RootLogNode): string | null {
    const level = this.level || rootLogNode.level
    if (validate(level, entry)) {
      return formatForTerminal(entry)
    }
    return null
  }

  onGraphChange(entry: LogEntry, rootLogNode: RootLogNode) {
    const out = this.render(entry, rootLogNode)
    if (out) {
      console.log(out)
    }
  }

  stop() { }
}
