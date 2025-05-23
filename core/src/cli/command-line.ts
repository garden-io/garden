/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Key } from "ink"
import { max } from "lodash-es"
import { resolve } from "path"
import sliceAnsi from "slice-ansi"
import stringArgv from "string-argv"
import stringWidth from "string-width"
import type { BuiltinArgs, Command, CommandResult, PrepareParams } from "../commands/base.js"
import { CommandGroup } from "../commands/base.js"
import type { ServeCommand } from "../commands/serve.js"
import { GlobalConfigStore } from "../config-store/global.js"
import { findProjectConfig } from "../config/base.js"
import { GardenError, toGardenError } from "../exceptions.js"
import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import { getTermWidth, renderDivider } from "../logger/util.js"
import type { GardenInstanceManager } from "../server/instance-manager.js"
import { TypedEventEmitter } from "../util/events.js"
import { uuidv4 } from "../util/random.js"
import { sleep } from "../util/util.js"
import type { AutocompleteSuggestion } from "./autocomplete.js"
import {
  getOtherCommands,
  getPopularCommands,
  parseCliArgs,
  pickCommand,
  processCliArgs,
  renderCommandErrors,
  renderCommands,
} from "./helpers.js"
import type { GlobalOptions, ParameterObject, ParameterValues } from "./params.js"
import { bindActiveContext, withSessionContext } from "../util/open-telemetry/context.js"
import { wrapActiveSpan } from "../util/open-telemetry/spans.js"
import { DEFAULT_BROWSER_DIVIDER_WIDTH } from "../constants.js"
import { styles } from "../logger/styles.js"
import type { GardenCli } from "./cli.js"

const defaultMessageDuration = 3000
const commandLinePrefix = styles.warning("🌼  > ")
const emptyCommandLinePlaceholder = styles.secondary("<enter command> (enter help for more info)")
const inputHistoryLength = 100

export type SetStringCallback = (data: string) => void

type KeyHandler = (input: string, key: Partial<Key>) => void

const directInputKeys = [
  "upArrow",
  "downArrow",
  "leftArrow",
  "rightArrow",
  "pageDown",
  "pageUp",
  "return",
  "escape",
  "tab",
  "delete",
]

const hideCommands = ["config analytics-enabled", "tools"]

interface CommandLineEvents {
  message: string
}

function getCmdsRunningMsg(commandNames: string[]) {
  let msg = ""
  if (commandNames.length === 1) {
    msg = `Running ${styles.command(commandNames[0])} command...`
  } else if (commandNames.length > 1) {
    msg = `Running ${commandNames.length} commands: ` + styles.command(commandNames.join(", "))
  }
  return msg
}

function getCmdSuccessMsg(commandName: string) {
  return `Command ${styles.command(commandName)} completed successfully!`
}

function getCmdFailMsg(commandName: string) {
  return `Failed running the ${commandName} command. Please see above for the logs. ☝️`
}

/**
 * Helper command for logging dev console command start and finish.
 *
 * Those log line don't map well between browser and terminal so we print a specific
 * log line for the terminal but also include the 'rawMsg' which will be preferred
 * by the web UI.
 */
function logCommand({ msg, log, width, error }: { msg: string; log: Log; width: number; error: boolean }) {
  const dividerColor = error ? styles.error : styles.primary
  const dividerOptsBase = { width, title: msg, color: dividerColor, char: "┈" }
  const terminalMsg = renderDivider(dividerOptsBase)
  const rawMsg = renderDivider({ ...dividerOptsBase, width: DEFAULT_BROWSER_DIVIDER_WIDTH })
  if (error) {
    log.error({ msg: terminalMsg, rawMsg })
  } else {
    log.info({ msg: "\n" + terminalMsg, rawMsg })
  }
}

export function logCommandStart({ commandName, log, width }: { commandName: string; log: Log; width: number }) {
  logCommand({ msg: getCmdsRunningMsg([commandName]), log, width, error: false })
}

export function logCommandSuccess({ commandName, log, width }: { commandName: string; log: Log; width: number }) {
  logCommand({ msg: getCmdSuccessMsg(commandName), log, width, error: false })
}

export function logCommandOutputErrors({ errors, log, width }: { errors: Error[]; log: Log; width: number }) {
  renderCommandErrors(log.root, errors, log)
  logCommand({ msg: "", log, width, error: true })
}

export function logCommandError({ error, log, width }: { error: Error; log: Log; width: number }) {
  log.error({ error: toGardenError(error) })
  logCommand({ msg: "", log, width, error: true })
}

// TODO-0.13.1+: support --root flag in commands
export class CommandLine extends TypedEventEmitter<CommandLineEvents> {
  public needsReload = false // Set to true when a config change is detected, and set back to false after reloading.
  private enabled: boolean

  private currentCommand: string
  private cursorPosition: number
  private historyIndex: number
  private suggestionIndex: number
  private autocompletingFrom: number
  private commandHistory: string[]
  private showCursor: boolean
  private runningCommands: { [id: string]: { command: Command; params: PrepareParams } }
  private persistentStatus: string

  private keyHandlers: { [key: string]: KeyHandler }

  private commandLineCallback: SetStringCallback
  private statusCallback: SetStringCallback
  private messageCallback: SetStringCallback
  private messageTimeout?: NodeJS.Timeout

  private serveCommand: ServeCommand
  private extraCommands: Command[]
  public cwd: string
  private manager: GardenInstanceManager
  private globalConfigStore: GlobalConfigStore
  private readonly log: Log
  private readonly globalOpts: Partial<ParameterValues<GlobalOptions>>
  // TODO: Make this required (doing this will unfortunately involve fixing hundreds of unit tests)
  private readonly cli: GardenCli | undefined

  constructor({
    cwd,
    manager,
    log,
    cli,
    globalOpts,
    serveCommand,
    extraCommands,
    history = [],
  }: {
    cwd: string
    manager: GardenInstanceManager
    log: Log
    cli: GardenCli | undefined
    globalOpts: Partial<ParameterValues<GlobalOptions>>
    serveCommand: ServeCommand
    extraCommands: Command[]
    history?: string[]
  }) {
    super()

    this.globalConfigStore = new GlobalConfigStore()

    this.cwd = cwd
    this.manager = manager
    this.log = log
    this.cli = cli
    this.globalOpts = globalOpts
    this.extraCommands = extraCommands
    this.serveCommand = serveCommand

    this.enabled = false
    this.currentCommand = ""
    this.cursorPosition = 0
    this.historyIndex = history.length
    this.suggestionIndex = -1
    this.autocompletingFrom = -1
    this.commandHistory = history
    this.showCursor = true
    this.runningCommands = {}
    this.persistentStatus = ""

    // This does nothing until a callback is supplied from outside
    this.commandLineCallback = () => {}
    this.messageCallback = () => {}
    this.statusCallback = () => {}

    this.keyHandlers = {}

    this.init()
  }

  setCallbacks({
    commandLine,
    message,
    status,
  }: {
    commandLine: SetStringCallback
    message: SetStringCallback
    status: SetStringCallback
  }) {
    this.commandLineCallback = commandLine
    this.messageCallback = message
    this.statusCallback = status
  }

  clearTimeout() {
    clearTimeout(this.messageTimeout)
  }

  getBlankCommandLine() {
    return commandLinePrefix + emptyCommandLinePlaceholder
  }

  handleInput(input: string, key: Partial<Key>) {
    if (!this.enabled) {
      return
    }

    let stringKey = input

    if (input === "[1~") {
      stringKey = "fn-leftArrow"
    } else if (input === "[4~") {
      stringKey = "fn-rightArrow"
    } else if (key.ctrl && !key.tab) {
      stringKey = "ctrl-" + stringKey
    } else if (key.delete && !key.meta) {
      // Seems to be needed at least for macbooks, may be an Ink bug.
      stringKey = "backspace"
    } else {
      for (const k of directInputKeys) {
        if (key[k]) {
          stringKey = k
          break
        }
      }
    }

    const handler = this.keyHandlers[stringKey]

    if (handler) {
      handler(input, key)
    } else if (this.isValidInput(input, key)) {
      this.addInput(input)
    }
  }

  private addInput(input: string) {
    // When pasting, only enter input up to first line break
    input = input.split(/\r?\n|\r|\n/g)[0]

    this.currentCommand =
      this.currentCommand.substring(0, this.cursorPosition) + input + this.currentCommand.substring(this.cursorPosition)
    this.moveCursor(this.cursorPosition + input.length)
    this.renderCommandLine()
  }

  async typeCommand(line: string) {
    this.enabled = false
    this.clear()
    // Make sure it takes at most 2 seconds to auto-type the command.
    const sleepMs = Math.min(Math.floor(2000 / line.length), 40)
    // We split newlines into separate commands
    const lines = line.trim().split(/[\r\n]+/)
    for (const cmd of lines) {
      for (const char of cmd) {
        this.addInput(char)
        this.commandLineCallback(commandLinePrefix + this.currentCommand)
        await sleep(sleepMs)
      }
      await sleep(250)
      this.handleReturn()
    }
    this.commandLineCallback(commandLinePrefix + this.currentCommand)
  }

  private isValidInput(input: string, key?: Partial<Key>) {
    // TODO: this is most likely not quite sufficient, nor the most efficient way to handle the inputs
    // FIXME: for one, typing an umlaut character does not appear to work on international English keyboards
    return (
      input.length > 0 &&
      (!key ||
        (!key.backspace &&
          !key.delete &&
          !key.downArrow &&
          !key.escape &&
          !key.leftArrow &&
          !key.meta &&
          !key.pageDown &&
          !key.pageUp &&
          !key.return &&
          !key.rightArrow &&
          !key.tab &&
          !key.upArrow))
    )
  }

  private init() {
    // Delete
    this.setKeyHandler("backspace", () => {
      if (this.cursorPosition > 0) {
        this.currentCommand =
          this.currentCommand.substring(0, this.cursorPosition - 1) + this.currentCommand.substring(this.cursorPosition)
        this.moveCursor(this.cursorPosition - 1)
        this.renderCommandLine()
      }
    })

    this.setKeyHandler("delete", () => {
      this.currentCommand =
        this.currentCommand.substring(0, this.cursorPosition) + this.currentCommand.substring(this.cursorPosition + 1)
      this.renderCommandLine()
    })

    // Move cursor
    this.setKeyHandler("leftArrow", () => {
      if (this.cursorPosition > 0) {
        this.moveCursor(this.cursorPosition - 1)
        this.renderCommandLine()
      }
    })

    this.setKeyHandler("rightArrow", () => {
      if (this.cursorPosition < this.currentCommand.length) {
        this.moveCursor(this.cursorPosition + 1)
        this.renderCommandLine()
      } else {
        // Try to autocomplete if we're at the end of the input
        this.handleTab()
      }
    })

    this.setKeyHandler("ctrl-a", () => {
      this.moveCursor(0)
      this.renderCommandLine()
    })

    this.setKeyHandler("fn-leftArrow", () => {
      this.moveCursor(0)
      this.renderCommandLine()
    })

    this.setKeyHandler("fn-rightArrow", () => {
      this.moveCursor(this.currentCommand.length)
      this.renderCommandLine()
    })

    // Execute
    this.setKeyHandler(
      "return",
      bindActiveContext(() => this.handleReturn())
    )

    // Autocomplete
    this.setKeyHandler("tab", () => {
      this.handleTab()
    })

    // Scroll through history
    this.setKeyHandler("upArrow", () => {
      if (this.historyIndex > 0) {
        this.historyIndex--
        this.currentCommand = this.commandHistory[this.historyIndex]
        this.moveCursor(this.currentCommand.length)
        this.renderCommandLine()
      }
    })

    this.setKeyHandler("downArrow", () => {
      if (this.historyIndex < this.commandHistory.length) {
        this.currentCommand = this.commandHistory[this.historyIndex]
        this.moveCursor(this.currentCommand.length)
        this.historyIndex++
      } else if (this.historyIndex > 0) {
        this.currentCommand = ""
        this.moveCursor(0)
        this.historyIndex = this.commandHistory.length
      }
      this.renderCommandLine()
    })

    // Clear from cursor back
    this.setKeyHandler("ctrl-u", () => {
      this.currentCommand = this.currentCommand.substring(this.cursorPosition)
      this.moveCursor(0)
      this.renderCommandLine()
    })

    // Clear line if at beginning
    this.setKeyHandler("ctrl-k", () => {
      if (this.cursorPosition === 0) {
        this.currentCommand = ""
        this.renderCommandLine()
      }
    })

    setInterval(() => {
      this.showCursor = !this.showCursor
      this.renderCommandLine()
    }, 600)
  }

  renderCommandLine() {
    if (!this.enabled) {
      return
    }

    let renderedCommand = this.currentCommand

    const suggestions = this.getSuggestions(this.currentCommand.length)

    if (this.isSuggestedCommand(suggestions)) {
      renderedCommand = styles.highlightSecondary(renderedCommand)
    }

    if (suggestions.length > 0) {
      // Show autocomplete suggestion after string
      renderedCommand = renderedCommand + styles.secondary(suggestions[0].line.substring(renderedCommand.length))
    }

    if (renderedCommand.length === 0) {
      if (this.showCursor) {
        renderedCommand =
          styles.underline(sliceAnsi(emptyCommandLinePlaceholder, 0, 1)) + sliceAnsi(emptyCommandLinePlaceholder, 1)
      } else {
        renderedCommand = emptyCommandLinePlaceholder
      }
    } else if (this.cursorPosition === renderedCommand.length) {
      renderedCommand = renderedCommand + (this.showCursor ? "_" : " ")
    } else {
      const cursorChar = sliceAnsi(renderedCommand, this.cursorPosition, this.cursorPosition + 1)

      renderedCommand =
        sliceAnsi(renderedCommand, 0, this.cursorPosition) +
        (this.showCursor ? styles.underline(cursorChar) : cursorChar) +
        sliceAnsi(renderedCommand, this.cursorPosition + 1)
    }

    this.commandLineCallback(commandLinePrefix + renderedCommand)
  }

  renderStatus() {
    const status = getCmdsRunningMsg(Object.values(this.runningCommands).map((cmd) => cmd.command.getFullName()))

    this.statusCallback(status)
  }

  disable(message: string) {
    this.enabled = false
    this.clearTimeout()
    this.commandLineCallback(message)
  }

  enable() {
    this.enabled = true
    this.renderCommandLine()
  }

  private printWithDividers(text: string, title: string) {
    let width = max(text.split("\n").map((l) => stringWidth(l.trimEnd()))) || 0
    width += 2
    const termWidth = getTermWidth()
    const minWidth = stringWidth(title) + 10

    if (width > termWidth) {
      width = termWidth
    }

    if (width < minWidth) {
      width = minWidth
    }

    const char = "┈"
    const color = styles.bold

    // `dedent` has a bug where it doesn't indent correctly
    // when there's ANSI codes in the beginning of a line.
    // Thus we have to dedent like this.
    const wrapped = `
${renderDivider({ title: styles.bold(title), width, char, color })}
${text}
${renderDivider({ width, char, color })}
`

    this.log.info(wrapped)
  }

  showHelp() {
    const commandsToRender = this.getCommands().filter((c) => {
      return !(c.hidden || c instanceof CommandGroup || hideCommands.includes(c.getFullName()))
    })

    const helpText = `
${styles.accent.underline("Popular commands:")}

${renderCommands(getPopularCommands(commandsToRender))}

${styles.accent.underline("Other commands:")}

${renderCommands(getOtherCommands(commandsToRender))}

${styles.accent.underline("Keys:")}

  ${styles.primary(`[tab]: auto-complete  [up/down]: command history  [ctrl-u]: clear line  [ctrl-d]: quit`)}
`
    this.printWithDividers(helpText, "help")
  }

  setPersistentStatus(msg: string) {
    this.persistentStatus = msg
  }

  /**
   * Flash the given `message` in the command line for `duration` milliseconds, meanwhile disabling the command line.
   */
  flashMessage(message: string, opts: FlashOpts = {}) {
    this.clearTimeout()

    const prefix = opts.prefix || ""
    this.messageCallback(prefix + message)

    this.messageTimeout = setTimeout(() => {
      this.messageCallback(this.persistentStatus)
    }, opts.duration || defaultMessageDuration)
  }

  flashSuccess(message: string, opts: FlashOpts = {}) {
    this.flashMessage(styles.success(message), { prefix: styles.success("✔︎  "), ...opts })
  }

  flashError(message: string, opts: FlashOpts = {}) {
    this.flashMessage(styles.error(message), { prefix: "❗️  ", ...opts })
  }

  flashWarning(message: string, opts: FlashOpts = {}) {
    this.flashMessage(styles.warning(message), { prefix: styles.warning("⚠️  "), ...opts })
  }

  setKeyHandler(stringKey: string, handler: KeyHandler) {
    this.keyHandlers[stringKey] = handler
  }

  private moveCursor(position: number) {
    this.cursorPosition = position
    this.autocompletingFrom = -1
    this.suggestionIndex = -1
  }

  private handleTab() {
    if (this.cursorPosition === 0) {
      return
    }
    const suggestions = this.getSuggestions(
      this.autocompletingFrom > -1 ? this.autocompletingFrom : this.cursorPosition
    )
    if (suggestions.length > 0) {
      this.suggestionIndex++
      if (this.suggestionIndex >= suggestions.length) {
        this.suggestionIndex = 0
      }
      // Pick the suggestion but remember where we are completing from, so we can roll through more suggestions
      this.currentCommand = suggestions[this.suggestionIndex].line
      if (this.autocompletingFrom === -1) {
        this.autocompletingFrom = this.cursorPosition
      }
      // Not using this.moveCursor() here so we don't reset the autocomplete state
      this.cursorPosition = this.currentCommand.length
      this.renderCommandLine()
    } else {
      this.suggestionIndex = -1
    }
  }

  clear() {
    this.currentCommand = ""
    this.moveCursor(0)
    this.renderCommandLine()
  }

  private getCommands() {
    return [...this.manager.getCommands(this.log, this.cwd), ...this.extraCommands]
  }

  private handleReturn() {
    if (this.currentCommand.trim() === "") {
      return
    }

    const rawArgs = stringArgv(this.currentCommand)
    const { command, rest, matchedPath } = pickCommand(this.getCommands(), rawArgs)

    if (!command) {
      this.flashError(`Could not find command. Try typing ${styles.accent("help")} to see the available commands.`)
      return
    }

    // Prepare args and opts
    let args: BuiltinArgs & ParameterValues<ParameterObject> = {}
    let opts: ParameterValues<ParameterObject & GlobalOptions>

    try {
      const parsedArgs = parseCliArgs({ stringArgs: rest, command, cli: false, skipGlobalDefault: true })

      // Handle -h, --help, and subcommand listings
      if (parsedArgs.h || parsedArgs.help || command instanceof CommandGroup) {
        // Try to show specific help for given subcommand
        if (command instanceof CommandGroup) {
          for (const subCommand of command.subCommands) {
            const sub = new subCommand()
            if (sub.name === rest[0]) {
              this.clear()
              this.printWithDividers("\n" + sub.renderHelp(), `help — ${sub.getFullName()}`)
              return
            }
          }
          // If not found, falls through to general command help below
        }
        this.clear()
        this.printWithDividers(command.renderHelp(), `help — ${command.getFullName()}`)
        return
      }

      const processed = processCliArgs({
        log: this.log,
        rawArgs,
        parsedArgs,
        command,
        matchedPath,
        cli: false,
        inheritedOpts: this.globalOpts,
        warnOnGlobalOpts: true,
      })
      args = processed.args
      opts = processed.opts
    } catch (error) {
      if (!(error instanceof GardenError)) {
        throw error
      }
      this.flashError(error.message)
      return
    }

    // Push the command to the top of the history
    this.commandHistory = [
      ...this.commandHistory.filter((cmd) => cmd !== this.currentCommand),
      this.currentCommand,
    ].slice(0, inputHistoryLength)
    this.historyIndex = this.commandHistory.length

    // Update command line
    this.clear()

    this.runCommand({ command, rawArgs, args, opts }).catch((error) => {
      this.flashError("Unexpected error while running command :/ Please see above for error logs ☝️")
      this.log.error({ error })
    })
  }

  private async runCommand({
    command,
    rawArgs,
    args,
    opts,
  }: {
    command: Command
    rawArgs: string[]
    args: PrepareParams["args"]
    opts: PrepareParams["opts"]
  }) {
    const id = uuidv4()
    const width = getTermWidth() - 2

    const prepareParams: PrepareParams = {
      log: this.log,
      args,
      opts,
      commandLine: this,
      parentCommand: this.serveCommand,
    }

    const name = command.getFullName()

    if (!command.allowInDevCommand(prepareParams)) {
      if ((name === "test" || name === "run") && opts["interactive"]) {
        // Specific error for interactive commands
        this.flashError(`Commands cannot be run in interactive mode in the dev console. Please run those separately.`)
      } else if (name === "dev") {
        this.flashError(`Nice try :)`)
      } else {
        this.flashError(`This command cannot be run in the dev console. Please run it in a separate terminal.`)
      }
      return
    }

    // Execute the command
    if (!command.isDevCommand) {
      this.flashMessage(getCmdsRunningMsg([name]))
      logCommandStart({ commandName: rawArgs.join(" "), width, log: this.log })
      this.runningCommands[id] = { command, params: prepareParams }
      this.renderStatus()
    }

    const sessionId = uuidv4()

    await withSessionContext(
      {
        sessionId,
        parentSessionId: this.manager.sessionId,
      },
      () =>
        wrapActiveSpan("spawnChildGarden", async () => {
          let garden: Garden

          try {
            let scan = true
            let path = this.cwd

            if (opts.root) {
              scan = false
              path = resolve(path, opts.root)
            }

            const projectConfig = await findProjectConfig({
              log: this.log,
              path,
              scan,
            })

            if (!projectConfig) {
              const msg = opts.root
                ? `Could not find project at specified --root '${opts.root}'`
                : `Could not find project in current directory or any parent directory`
              this.flashError(getCmdFailMsg(name))
              this.log.error(msg)
              return
            }

            garden = await wrapActiveSpan("getGardenForRequest", () =>
              this.manager.getGardenForRequest({
                command,
                projectConfig,
                globalConfigStore: this.globalConfigStore,
                log: this.log,
                args,
                opts,
                sessionId,
              })
            )
          } catch (error) {
            this.flashError(getCmdFailMsg(name))
            delete this.runningCommands[id]
            this.renderStatus()
            this.log.error({ error: toGardenError(error) })
            return
          }

          // Update persisted history
          // Note: We're currently not resolving history across concurrent dev commands, but that's anyway not well supported
          garden.localConfigStore.set("devCommandHistory", this.commandHistory).catch((error) => {
            this.log.warn(`Could not persist command history: ${error}`)
          })

          command
            .run({
              ...prepareParams,
              garden,
              cli: this.cli,
              sessionId,
              parentSessionId: this.manager.sessionId,
            })
            .then((output: CommandResult) => {
              if (output.errors?.length) {
                logCommandOutputErrors({ errors: output.errors, log: this.log, width })
                this.flashError(getCmdFailMsg(name))
              } else if (!command.isDevCommand) {
                // TODO: print this differently if monitors from the command are active
                // const monitorsAdded = garden.monitors.getByCommand(command).length
                this.flashSuccess(getCmdSuccessMsg(name))
                logCommandSuccess({ commandName: name, width, log: this.log })
              }
            })
            .catch((error: Error) => {
              // TODO-0.13.1: improve error rendering
              logCommandError({ error, width, log: this.log })
              this.flashError(getCmdFailMsg(name))
            })
            .finally(() => {
              delete this.runningCommands[id]
              this.renderStatus()
              garden.events.clearKey(sessionId)
            })
        })
    )
  }

  private getSuggestions(from: number): AutocompleteSuggestion[] {
    if (from === 0) {
      return []
    }

    const input = this.currentCommand.substring(0, from)
    return this.manager.getAutocompleteSuggestions({
      log: this.log,
      projectRoot: this.cwd,
      input,
      ignoreGlobalFlags: true,
    })
  }

  private isSuggestedCommand(suggestions: AutocompleteSuggestion[]) {
    // TODO: we may want to tune this
    for (const s of suggestions) {
      if (this.currentCommand === s.line) {
        return true
      }
    }
    return false
  }
}

interface FlashOpts {
  prefix?: string
  duration?: number
}
