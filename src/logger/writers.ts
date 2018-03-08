import * as logUpdate from "log-update"
import * as cliCursor from "cli-cursor"
import { getChildNodes, interceptStream } from "./util"

import {
  EntryStatus,
  LogLevel,
} from "./types"

import { LogEntry, RootLogNode } from "./index"

const INTERVAL_DELAY = 100

export interface ConsoleWriter {
  rootLogNode: RootLogNode
  level: LogLevel
  render(entry: LogEntry): string | string[] | null
  write(entry: LogEntry): void
  stop(): void
}

export class BasicConsoleWriter implements ConsoleWriter {
  public rootLogNode: RootLogNode
  public level: LogLevel

  constructor(level: LogLevel, rootLogNode: RootLogNode) {
    this.level = level
    this.rootLogNode = rootLogNode
  }

  render(entry: LogEntry): string | null {
    if (this.level >= entry.level) {
      return entry.render()
    }
    return null
  }

  write(entry: LogEntry) {
    const out = this.render(entry)
    if (out) {
      console.log(out)
    }
  }

  // No op
  stop() { }
}

export class FancyConsoleWriter implements ConsoleWriter {
  private logUpdate: any
  private intervalID: NodeJS.Timer | null

  public rootLogNode: RootLogNode
  public level: LogLevel

  constructor(level: LogLevel, rootLogNode: RootLogNode) {
    this.level = level
    this.rootLogNode = rootLogNode
    this.intervalID = null
    this.logUpdate = this.initLogUpdate()
  }

  private initLogUpdate(): any {
    // Create custom stream that calls write method with the 'noIntercept' option.
    const stream = {
      ...process.stdout,
      write: (str, enc, cb) => (<any>process.stdout.write)(str, enc, cb, { noIntercept: true }),
    }
    const makeOpts = (msg: string) => ({
      // Remove trailing new line from console writes since Logger already handles it
      msg: msg.replace(/\n$/, ""),
      notOriginatedFromLogger: true,
    })
    // NOTE: On every write, log-update library calls the cli-cursor library to hide the cursor
    // which the cli-cursor library does via stderr write. This causes an infinite loop as
    // the stderr writes are intercepted and funneled back to the Logger.
    // Therefore we manually toggle the cursor using the custom stream from above.
    //
    // log-update types are missing the `opts?: {showCursor?: boolean}` parameter
    const customLogUpdate = (<any>logUpdate.create)(<any>stream, { showCursor: true })
    cliCursor.hide(stream)

    const restoreStreamFns = [
      interceptStream(process.stdout, msg => this.rootLogNode.info(makeOpts(msg))),
      interceptStream(process.stderr, msg => this.rootLogNode.error(makeOpts(msg))),
    ]

    const cleanUp = () => {
      cliCursor.show(stream)
      restoreStreamFns.forEach(restoreStream => restoreStream())
      logUpdate.done()
    }
    customLogUpdate.cleanUp = cleanUp

    return customLogUpdate
  }

  private startLoop(): void {
    if (!this.intervalID) {
      this.intervalID = setInterval(this.write.bind(this), INTERVAL_DELAY)
    }
  }

  private stopLoop(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  write(): void {
    const out = this.render()
    if (out) {
      this.logUpdate(out.join("\n"))
    }
  }

  // Has a side effect in that it starts/stops the rendering loop depending on
  // whether or not active entries were found while building output
  render(): string[] | null {
    let hasActiveEntries = false
    const entries = <any>getChildNodes(this.rootLogNode)
    const out = entries.reduce((acc: string[], e: LogEntry) => {
      if (e.status === EntryStatus.ACTIVE) {
        hasActiveEntries = true
      }
      if (this.level >= e.level) {
        acc.push(e.render())
      }
      return acc
    }, [])
    if (hasActiveEntries) {
      this.startLoop()
    } else {
      this.stopLoop()
    }
    if (out.length) {
      return out
    }
    return null
  }

  stop() {
    this.stopLoop()
    this.logUpdate.cleanUp()
  }

}
