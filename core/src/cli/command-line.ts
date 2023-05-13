/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Key } from "ink"
import { keyBy, max } from "lodash"
import sliceAnsi from "slice-ansi"
import stringWidth from "string-width"
import { BuiltinArgs, Command, CommandGroup, CommandParams, CommandResult } from "../commands/base"
import { toGardenError } from "../exceptions"
import { ConfigDump, Garden } from "../garden"
import { Log } from "../logger/log-entry"
import { getRootLogger } from "../logger/logger"
import { renderDivider } from "../logger/util"
import { TypedEventEmitter } from "../util/events"
import { uuidv4 } from "../util/random"
import { sleep } from "../util/util"
import { Autocompleter, AutocompleteSuggestion } from "./autocomplete"
import { parseCliArgs, pickCommand, processCliArgs, renderCommandErrors, renderCommands } from "./helpers"
import { GlobalOptions, ParameterValues } from "./params"
import { ServeCommand } from "../commands/serve"

const defaultMessageDuration = 2000
const commandLinePrefix = chalk.yellow("🌼  > ")
const emptyCommandLinePlaceholder = chalk.gray("<enter command> (enter help for more info)")
const inputHistoryLength = 100

const styles = {
  command: chalk.white.bold,
}

export type SetStringCallback = (data: string) => void

type KeyHandler = (input: string, key: Key) => void

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

function getCmdStartMsg(commandName: string) {
  return `Running ${chalk.white.bold(commandName)}...`
}

function getCmdSuccessMsg(commandName: string) {
  return `${chalk.whiteBright(commandName)} command completed successfully!`
}

function getCmdFailMsg(commandName: string) {
  return `Failed running the ${commandName} command. Please see above for the logs.`
}

export function logCommandStart({ commandName, log, width }: { commandName: string; log: Log; width: number }) {
  const msg = getCmdStartMsg(commandName)
  log.info("\n" + renderDivider({ width, title: msg, color: chalk.blueBright, char: "┈" }))
}

export function logCommandSuccess({ commandName, log, width }: { commandName: string; log: Log; width: number }) {
  const msg = getCmdSuccessMsg(commandName)
  log.info(renderDivider({ width, title: chalk.green("✓ ") + msg, color: chalk.blueBright, char: "┈" }))
}

export function logCommandOutputErrors({ errors, log, width }: { errors: Error[]; log: Log; width: number }) {
  renderCommandErrors(getRootLogger(), errors, log)
  log.error({ msg: renderDivider({ width, color: chalk.red }) })
}

export function logCommandError({ error, log, width }: { error: Error; log: Log; width: number }) {
  log.error({ error: toGardenError(error) })
  log.error({ msg: renderDivider({ width, color: chalk.red, char: "┈" }) })
}

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
  private runningCommands: { [id: string]: { command: Command; params: CommandParams } }
  private persistentStatus: string

  private keyHandlers: { [key: string]: KeyHandler }

  private commandLineCallback: SetStringCallback
  private statusCallback: SetStringCallback
  private messageCallback: SetStringCallback
  private messageTimeout: NodeJS.Timeout

  private autocompleter: Autocompleter
  private garden: Garden
  private serverCommand: ServeCommand
  private readonly log: Log
  private commands: Command[]
  private readonly globalOpts: Partial<ParameterValues<GlobalOptions>>

  constructor({
    garden,
    serverCommand,
    log,
    commands,
    configDump,
    globalOpts,
    history = [],
  }: {
    garden: Garden
    serverCommand: ServeCommand
    log: Log
    commands: Command[]
    configDump?: ConfigDump
    globalOpts: Partial<ParameterValues<GlobalOptions>>
    history?: string[]
  }) {
    super()

    this.garden = garden
    this.serverCommand = serverCommand
    this.log = log
    this.commands = commands
    this.globalOpts = globalOpts

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

    this.autocompleter = new Autocompleter({ log, commands, configDump, debug: true })
    this.init()
  }

  async update(garden: Garden, configDump: ConfigDump, commands: Command[]) {
    const byName = keyBy(
      this.commands.filter((c) => !c.isCustom),
      (c) => c.getFullName()
    )

    for (const c of commands) {
      byName[c.getFullName()] = c
    }

    this.commands = Object.values(byName)
    this.garden = garden
    this.autocompleter = new Autocompleter({ log: this.log, commands: this.commands, configDump, debug: true })
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

  keyStroke(input: string, key: Key) {
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
    } else if (this.isValidInputCharacter(input, key)) {
      this.addCharacter(input)
    }
  }

  private addCharacter(char: string) {
    this.currentCommand =
      this.currentCommand.substring(0, this.cursorPosition) + char + this.currentCommand.substring(this.cursorPosition)
    this.moveCursor(this.cursorPosition + 1)
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
        this.addCharacter(char)
        this.commandLineCallback(commandLinePrefix + this.currentCommand)
        await sleep(sleepMs)
      }
      await sleep(250)
      await this.handleReturn()
    }
    this.commandLineCallback(commandLinePrefix + this.currentCommand)
  }

  private isValidInputCharacter(input: string, key?: Key) {
    // TODO: this is most likely not quite sufficient, nor the most efficient way to handle the inputs
    // FIXME: for one, typing an umlaut character does not appear to work on international English keyboards
    return (
      input.length === 1 &&
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
    this.setKeyHandler("return", () => this.handleReturn())

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
      renderedCommand = chalk.cyan(renderedCommand)
    }

    if (suggestions.length > 0) {
      // Show autocomplete suggestion after string
      renderedCommand = renderedCommand + chalk.gray(suggestions[0].line.substring(renderedCommand.length))
    }

    if (renderedCommand.length === 0) {
      if (this.showCursor) {
        renderedCommand =
          chalk.underline(sliceAnsi(emptyCommandLinePlaceholder, 0, 1)) + sliceAnsi(emptyCommandLinePlaceholder, 1)
      } else {
        renderedCommand = emptyCommandLinePlaceholder
      }
    } else if (this.cursorPosition === renderedCommand.length) {
      renderedCommand = renderedCommand + (this.showCursor ? "_" : " ")
    } else {
      const cursorChar = sliceAnsi(renderedCommand, this.cursorPosition, this.cursorPosition + 1)

      renderedCommand =
        sliceAnsi(renderedCommand, 0, this.cursorPosition) +
        (this.showCursor ? chalk.underline(cursorChar) : cursorChar) +
        sliceAnsi(renderedCommand, this.cursorPosition + 1)
    }

    this.commandLineCallback(commandLinePrefix + renderedCommand)
  }

  renderStatus() {
    let status = this.persistentStatus

    const runningCommands = Object.values(this.runningCommands)

    // TODO: show spinner here
    if (runningCommands.length === 1) {
      status = chalk.cyan(`🕙  Running ${styles.command(runningCommands[0].command.getFullName())} command...`)
    } else if (runningCommands.length > 1) {
      status =
        chalk.cyan(`🕙  Running ${runningCommands.length} commands: `) +
        styles.command(runningCommands.map((c) => c.command.getFullName()).join(", "))
    }

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

  getTermWidth() {
    // TODO: accept stdout in constructor
    return process.stdout?.columns || 100
  }

  private printWithDividers(text: string, title: string) {
    let width = max(text.split("\n").map((l) => stringWidth(l.trimEnd()))) || 0
    width += 2
    const termWidth = this.getTermWidth()
    const minWidth = stringWidth(title) + 10

    if (width > termWidth) {
      width = termWidth
    }

    if (width < minWidth) {
      width = minWidth
    }

    const char = "┈"
    const color = chalk.bold

    const wrapped = `
${renderDivider({ title: chalk.bold(title), width, char, color })}
${text}
${renderDivider({ width, char, color })}
`

    this.log.info(wrapped)
  }

  showHelp() {
    // TODO: group commands by category?
    const renderedCommands = renderCommands(
      this.commands.filter((c) => !(c.hidden || c instanceof CommandGroup || hideCommands.includes(c.getFullName())))
    )

    const helpText = `
${chalk.white.underline("Available commands:")}

${renderedCommands}

${chalk.white.underline("Keys:")}

  ${chalk.gray(`[tab]: auto-complete  [up/down]: command history  [ctrl-d]: quit`)}
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

    const prefix = opts.prefix || chalk.cyan("ℹ︎ ")
    this.messageCallback(prefix + message)

    this.messageTimeout = setTimeout(() => {
      this.messageCallback(this.persistentStatus)
    }, opts.duration || defaultMessageDuration)
  }

  flashSuccess(message: string, opts: FlashOpts = {}) {
    this.flashMessage(chalk.green(message), { prefix: chalk.green("✔︎  "), ...opts })
  }

  flashError(message: string, opts: FlashOpts = {}) {
    this.flashMessage(chalk.red(message), { prefix: "❗️  ", ...opts })
  }

  flashWarning(message: string, opts: FlashOpts = {}) {
    this.flashMessage(chalk.yellowBright(message), { prefix: chalk.yellow("⚠️  "), ...opts })
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

  private handleReturn() {
    if (this.currentCommand.trim() === "") {
      return
    }
    return this.reloadIfConfigChanged()
      .catch((error: Error) => {
        logCommandError({ error, width: this.getTermWidth(), log: this.log })
      })
      .then(() => this.parseAndRunCommand())
  }

  private async reloadIfConfigChanged() {
    if (this.needsReload) {
      const currentCommand = this.currentCommand
      await this.serverCommand.reload({ log: this.log, garden: this.garden })
      // We want the pre-reload command to be maintained across the reload.
      this.currentCommand = currentCommand
      this.needsReload = false
    }
  }

  private parseAndRunCommand() {
    const rawArgs = this.currentCommand.trim().split(" ")
    const { command, rest, matchedPath } = pickCommand(this.commands, rawArgs)

    if (!command) {
      this.flashError(`Could not find command. Try typing ${chalk.white("help")} to see the available commands.`)
      return
    }

    // Prepare args and opts
    let args: BuiltinArgs & ParameterValues<any> = {}
    let opts: ParameterValues<any> = {}

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

    // Update persisted history
    // Note: We're currently not resolving history across concurrent dev commands, but that's anyway not well supported
    this.garden.localConfigStore.set("devCommandHistory", this.commandHistory).catch((error) => {
      this.log.warn(chalk.yellow(`Could not persist command history: ${error}`))
    })

    const id = uuidv4()
    const width = this.getTermWidth() - 2

    const params = {
      garden: this.garden,
      log: this.log,
      headerLog: this.log,
      footerLog: this.log,
      args,
      opts,
      commandLine: this,
    }

    const name = command.getFullName()

    if (!command.allowInDevCommand(params)) {
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
      // this.flashMessage(getCmdStartMsg(name))
      // logCommandStart({ commandName: name, width, log: this.log })
      const msg = `Running command: ${chalk.white.bold(rawArgs.join(" "))}`
      this.flashMessage(msg)
      this.log.info({ msg: "\n" + renderDivider({ width, title: msg, color: chalk.blueBright, char: "┈" }) })
      this.runningCommands[id] = { command, params }
      this.renderStatus()
    }
    // Clear the VCS handler's tree cache to make sure we pick up any changed sources.
    this.garden.clearTreeCache()

    command
      .action(params)
      .then((output: CommandResult) => {
        if (output.errors?.length) {
          logCommandOutputErrors({ errors: output.errors, log: this.log, width })
          this.flashError(getCmdFailMsg(name))
        } else if (!command.isDevCommand) {
          // TODO: print this differently if monitors from the command are active
          // const monitorsAdded = this.garden.monitors.getByCommand(command).length
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
      })
  }

  private getSuggestions(from: number): AutocompleteSuggestion[] {
    if (from === 0) {
      return []
    }

    const input = this.currentCommand.substring(0, from)
    return this.autocompleter.getSuggestions(input, { ignoreGlobalFlags: true })
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
