import * as yargs from "yargs"
import { intersection } from "lodash"
import { Parameter, Command, ChoicesParameter, StringParameter } from "./commands/base"
import { ValidateCommand } from "./commands/validate"
import { PluginError } from "./exceptions"
import { GardenContext } from "./context"
import { getLogger, RootLogNode } from "./logger"
import { resolve } from "path"
import { BuildCommand } from "./commands/build"
import { EnvironmentStatusCommand } from "./commands/environment/status"
import { EnvironmentConfigureCommand } from "./commands/environment/configure"
import { DeployCommand } from "./commands/deploy"
import { CallCommand } from "./commands/call"
import { defaultPlugins } from "./plugins"
import { TestCommand } from "./commands/test"
import { DevCommand } from "./commands/dev"
import { LogsCommand } from "./commands/logs"

const GLOBAL_OPTIONS = {
  root: new StringParameter({
    alias: "r",
    help: "override project root directory (defaults to working directory)",
    defaultValue: process.cwd(),
  }),
}

// Helper functions
const getKeys = (obj: any): string[] => Object.keys(obj || {})
const filterByArr = (obj: any, arr: string[]): any => {
  return arr.reduce((memo, key) => {
    if (obj[key]) {
      memo[key] = obj[key]
    }
    return memo
  }, {})
}

type Argv = yargs.Argv["argv"]

function makeOptsConfig(param: Parameter<any>): yargs.Options {
  return makeParamConfig(param)
}

function makeArgConfig(param: Parameter<any>): yargs.PositionalOptions {
  return makeParamConfig(param)
}

// TODO autocomplete
function makeParamConfig(param: Parameter<any>): yargs.PositionalOptions {
  const {
    alias,
    defaultValue,
    help: description,
    type,
    validate: coerce,
  } = param
  const opts: yargs.PositionalOptions = {
    alias,
    coerce,
    description,
    default: defaultValue,
  }
  if (type === "choice") {
    opts["choices"] = (<ChoicesParameter>param).choices
  }
  return opts
}
// Workaround to let Yargs handle async actions. See https://github.com/yargs/yargs/issues/1069
function asyncHandleAction(action): (argv: Argv) => Promise<void> {
  return async argv => {
    argv.promisedResult = action(argv)
  }
}
// Global opts are set with `program.options({opt1: opt1Config, opt2: optConfig, ...})`
function makeGlobalOptsConfig() {
  return getKeys(GLOBAL_OPTIONS).reduce((memo, key) => {
    memo[key] = makeOptsConfig(GLOBAL_OPTIONS[key])
    return memo
  }, {})
}

export class GardenCli {
  program: yargs.Argv
  commands: { [key: string]: Command } = {}
  logger: RootLogNode

  constructor() {
    const version = require("../package.json").version

    this.logger = getLogger()
    this.program = yargs
      .version(version)
      .options(makeGlobalOptsConfig())

    // configure built-in commands
    const commands = [
      new BuildCommand(),
      new CallCommand(),
      new DeployCommand(),
      new DevCommand(),
      new EnvironmentConfigureCommand(),
      new EnvironmentStatusCommand(),
      new LogsCommand(),
      new TestCommand(),
      new ValidateCommand(),
    ]
    commands.forEach(command => this.addCommand(command))
  }

  addCommand(command: Command) {
    if (this.commands[command.name]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${command.name}"`, {})
    }

    this.commands[command.name] = command

    const logger = this.logger

    const args = command.arguments as Parameter<any>
    const options = command.options as Parameter<any>
    const argKeys = getKeys(args)
    const optKeys = getKeys(options)
    const globalKeys = getKeys(GLOBAL_OPTIONS)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {})
    }

    const action = async argv => {
      // Yargs returns positional args and options in a single object which we separate into args and opts
      const argsForAction = filterByArr(argv, argKeys)
      const optsForAction = filterByArr(argv, optKeys.concat(globalKeys))
      const root = resolve(process.cwd(), optsForAction.root)
      const ctx = await GardenContext.factory(root, { logger, plugins: defaultPlugins })

      return command.action(ctx, argsForAction, optsForAction)
    }

    // Command specific positional args and options are set inside the builder function
    const builder: yargs.CommandBuilder = parser => {
      argKeys.forEach(key => parser.positional(key, makeArgConfig(args[key])))
      optKeys.forEach(key => parser.option(key, makeOptsConfig(options[key])))
      return parser
    }
    const handler = asyncHandleAction(action)

    const argSynopsis: string[] = argKeys.map(key => args[key].required ? `<${key}>` : `[${key}]`)
    const commandStr = `${command.name}${argSynopsis.length > 0 ? " " + argSynopsis.join(" ") : ""}`

    const commandOpts = {
      builder,
      handler,
      aliases: command.alias,
      command: commandStr,
      describe: command.help,
    }

    this.program.command(commandOpts)
  }

  async parse(args: string) {
    return new Promise((res, rej) => {
      this.program.parse(args, (parseErr, argv, output) => {
        // Maybe let logger handle these
        if (output || parseErr || argv.promisedResult) {
          this.logger.stop()
        }

        // Process exited due to a call to --help or --version
        if (output) {
          console.log(output)
          return res()
        }
        if (parseErr) {
          console.log(parseErr)
          return rej(parseErr)
        }
        if (argv.promisedResult) {
          return argv.promisedResult
            .then(res)
            .catch(err => {
              console.error(err)
              return rej(err)
            })
        } else {
          return res()
        }
      })
    })
  }
}

export async function run(argv: string[]) {
  // The second parameter is the path to folder that contains command modules.
  const cli = new GardenCli()
  return cli.parse(argv.slice(2).join(" "))
}
