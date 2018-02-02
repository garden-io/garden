import * as caporal from "caporal"
import { Parameter, Command, StringParameter } from "./commands/base"
import { ValidateCommand } from "./commands/validate"
import { PluginError } from "./exceptions"
import { GardenContext } from "./context"
import { getLogger, Logger } from "./log"
import { resolve } from "path"
import { BuildCommand } from "./commands/build"
import { EnvironmentStatusCommand } from "./commands/environment/status"
import { EnvironmentConfigureCommand } from "./commands/environment/configure"
import { DeployCommand } from "./commands/deploy"

// TODO: feels like we should be able to set these as a global option
const commonOptions = {
  root: new StringParameter({
    alias: "r",
    help: "override project root directory (defaults to working directory)",
    defaultValue: process.cwd(),
  }),
}

export class GardenCli {
  // The types in Caporal are are broken atm: https://github.com/mattallty/Caporal.js/issues/91
  // TODO: I don't particularly like Caporal.js, we might want to replace it at some point -JE
  program: any
  commands: { [key: string]: Command } = {}
  logger: Logger

  constructor() {
    this.logger = getLogger()

    const version = require("../package.json").version

    this.program = (<any>caporal)
      .name("garden")
      .bin("garden")
      .version(version)
      .logger(this.logger)

    // monkey patch error handler for more useful output
    // this.program.fatalError = (err: Error) => {
    //   console.log(err)
    // }

    // configure built-in commands
    this.addCommand(new BuildCommand())
    this.addCommand(new ValidateCommand())
    this.addCommand(new DeployCommand())
    this.addCommand(new EnvironmentStatusCommand())
    this.addCommand(new EnvironmentConfigureCommand())
  }

  addCommand(command: Command) {
    if (this.commands[command.name]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${command.name}"`, {})
    }

    this.commands[command.name] = command

    // Translate the Command class and its arguments to the Caporal program
    let cliCommand = this.program
      .command(command.name, command.help)
      .help(command.help)

    if (command.alias) {
      cliCommand = cliCommand.alias(command.alias)
    }

    const addArgument = (name: string, arg: Parameter<any>) => {
      const synopsis = arg.required ? `<${name}>` : `[${name}]`

      cliCommand = cliCommand
        .argument(synopsis, arg.help, (input: string) => {
          return arg.validate(input)
        }, arg.defaultValue)
        .complete(() => {
          return arg.autoComplete()
        })
    }

    const addOption = (name: string, arg: Parameter<any>) => {
      const valueName = arg.required ? `<${arg.valueName}>` : `[${arg.valueName}]`
      let synopsis = arg.type === "boolean" ? `--${name}` : `--${name} ${valueName}`

      if (arg.alias) {
        synopsis = `-${arg.alias}, ${synopsis}`
      }

      cliCommand = cliCommand
        .option(synopsis, arg.help, (input: string) => {
          return arg.validate(input)
        }, arg.defaultValue)
        .complete(() => {
          return arg.autoComplete()
        })
    }

    for (let key of Object.keys(commonOptions)) {
      addOption(key, commonOptions[key])
    }

    for (let key of Object.keys(command.arguments || {})) {
      addArgument(key, command.arguments[key])
    }

    for (let key of Object.keys(command.options || {})) {
      if (commonOptions[key]) {
        throw new PluginError(`Common option ${key} cannot be redefined`, {})
      }

      addOption(key, command.options[key])
    }

    const logger = this.logger

    cliCommand = cliCommand.action((args, opts) => {
      const root = resolve(process.cwd(), opts.root)
      const context = new GardenContext(root, logger)

      return command.action(context, args, opts)
    })
  }

  async parse(argv: string[]) {
    const parsed = await this.program.parse(argv)
    this.logger.finish()
    return parsed
  }

  exec(args: string[], opts?: object) {
    return this.program.exec(args, opts || {})
  }
}

export async function run(argv: string[]) {
  // The second parameter is the path to folder that contains command modules.
  const cli = new GardenCli()

  return cli.parse(argv)
}
