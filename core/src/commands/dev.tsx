/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandResult, CommandParams, InteractiveCommand } from "./base"
import { renderDivider } from "../logger/util"
import React, { FC, useState } from "react"
import { Box, render, Text, useInput, useStdout } from "ink"
import { serveArgs, ServeCommand, serveOpts } from "./serve"
import { getLogger, getLogLevelChoices, LoggerType, LogLevel } from "../logger/logger"
import { ParameterError } from "../exceptions"
import { InkTerminalWriter } from "../logger/writers/ink-terminal-writer"
import { CommandLine } from "../cli/command-line"
import chalk from "chalk"
import { ChoicesParameter, globalOptions } from "../cli/params"
import { getBuiltinCommands } from "./commands"
import { getCustomCommands } from "./custom"
import { pick } from "lodash"
import Divider from "ink-divider"
import moment from "moment"
import dedent from "dedent"

const devCommandArgs = {
  ...serveArgs,
}
const devCommandOpts = {
  ...serveOpts,
}

type DevCommandArgs = typeof devCommandArgs
type DevCommandOpts = typeof devCommandOpts
type ActionParams = CommandParams<DevCommandArgs, DevCommandOpts>

export class DevCommand extends ServeCommand<DevCommandArgs, DevCommandOpts> {
  name = "dev"
  help = "Starts the Garden interactive development environment."

  protected = true
  cliOnly = true

  arguments = devCommandArgs
  options = devCommandOpts

  printHeader({ headerLog }) {
    const width = process.stdout?.columns ? process.stdout?.columns - 2 : 100

    headerLog.info(chalk.magenta(`
${renderDivider({ color: chalk.green, title: chalk.green.bold("🌳  garden dev 🌳 " ), width })}

${chalk.bold(`Good ${getGreetingTime()}! Welcome to the Garden interactive development console.`)}
Let's get your development environment wired up.
    `))
  }

  getLoggerType(): LoggerType {
    return "ink"
  }

  async action(params: ActionParams): Promise<CommandResult> {
    const logger = getLogger()
    const writers = logger.getWriters()
    const inkWriter = writers.find((w) => w.type === "ink") as InkTerminalWriter

    // TODO: maybe enforce this elsewhere
    if (!inkWriter) {
      throw new ParameterError(`This command can only be used with the ink logger type`, {
        writerTypes: writers.map((w) => w.type),
      })
    }

    const commandLine = await this.initCommandHandler(params, inkWriter)

    const Dev: FC<{}> = ({}) => {
      // Stream log output directly to stdout, on top of the Ink components below
      const { stdout, write } = useStdout()
      inkWriter.setWriteCallback(write)

      const [line, setLine] = useState(commandLine.getBlankCommandLine())
      // const [status, _setStatus] = useState("")
      const [message, setMessage] = useState("")

      // Note: Using callbacks here instead of events to make keypresses a bit more responsive
      commandLine.setCommandLineCallback(setLine)
      commandLine.setMessageCallback(setMessage)

      useInput((input, key) => {
        commandLine.keyStroke(input, key)
      })

      return (
        <Box flexDirection="column" paddingTop={1}>
          <Divider title={"🌼 🌸 🌷 🌺 🌻"} width={stdout?.columns || 50} dividerColor={"green"} />
          <Box height={1} marginLeft={1}>
            <Text>{line}</Text>
          </Box>
          <Box height={1} marginTop={1} marginLeft={2}>
            <Text>{message}</Text>
          </Box>
        </Box>
      )
    }

    render(<Dev />)

    commandLine.flashSuccess(chalk.white.bold(`Dev console is ready to go! 🚀`))

    // TODO: detect config changes and notify user in status

    return super.action(params)
  }

  private async initCommandHandler(params: ActionParams, writer: InkTerminalWriter) {
    const _this = this
    const { garden, log, opts } = params

    // TODO: This crashes the process if it fails. We may want to handle that gracefully and
    // allow reloading on request.
    const configDump = await garden.dumpConfig({ log })

    const builtinCommands = getBuiltinCommands()
    const customCommands = await getCustomCommands(garden.projectRoot)

    /**
     * Help/utility commands
     */
    const cl = new CommandLine({
      garden,
      log,
      commands: [
        ...builtinCommands,
        ...customCommands,
        new HelpCommand(),
        new QuitCommand(quit),
        new QuietCommand(),
        new QuiteCommand(),
        new LogLevelCommand(writer),
      ],
      configDump,
      globalOpts: pick(opts, Object.keys(globalOptions)),
    })

    function quit() {
      cl?.disable("Thanks for stopping by, love you! ❤️")
      _this.terminate()
    }

    process.on("SIGINT", quit)

    // Support ctrl-c and ctrl-d to exit
    cl.setKeyHandler("ctrl-d", quit)
    cl.setKeyHandler("ctrl-c", quit)

    return cl
  }
}

class HelpCommand extends InteractiveCommand {
  name = "help"
  help = ""
  hidden = true

  async action({ commandLine }: CommandParams) {
    commandLine?.showHelp()
    return {}
  }
}

class QuitCommand extends InteractiveCommand {
  name = "quit"
  help = "Exit the dev console."

  constructor(private quit: () => void) {
    super()
  }

  async action() {
    this.quit()
    return {}
  }
}

class QuietCommand extends InteractiveCommand {
  name = "quiet"
  help = ""
  hidden = true

  async action({ commandLine }: CommandParams) {
    commandLine?.flashMessage(chalk.italic("Shh!"), { prefix: "🤫  " })
    return {}
  }
}

class QuiteCommand extends InteractiveCommand {
  name = "quite"
  help = ""
  hidden = true

  async action({ commandLine }: CommandParams) {
    commandLine?.flashMessage(chalk.italic("Indeed!"), { prefix: "🎩  " })
    return {}
  }
}

const logLevelArguments = {
  level: new ChoicesParameter({
    choices: getLogLevelChoices(),
    help: "The log level to set",
    required: true,
  }),
}

type LogLevelArguments = typeof logLevelArguments

class LogLevelCommand extends InteractiveCommand<LogLevelArguments> {
  name = "log-level"
  help = "Change the maximum log level of (future) logs"

  arguments = logLevelArguments

  constructor(private writer: InkTerminalWriter) {
    super()
  }

  async action({ commandLine, args }: CommandParams<LogLevelArguments>) {
    // TODO: validate arg outside
    const level = args.level
    commandLine?.flashMessage(`Log level set to ${level}`)
    this.writer.level = (level as unknown) as LogLevel
    return {}
  }
}

function getGreetingTime() {
  const m = moment()

  const currentHour = parseFloat(m.format("HH"))

  if (currentHour >= 17) {
    return "evening"
  } else if (currentHour >= 12) {
    return "afternoon"
  } else {
    return "morning"
  }
}
