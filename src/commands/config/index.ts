import { Command } from "../base"
import { ConfigGetCommand } from "./get"
import { ConfigDeleteCommand } from "./delete"
import { ConfigSetCommand } from "./set"

export class ConfigCommand extends Command {
  name = "config"
  alias = "c"
  help = "Manage configuration variables in your environment"

  subCommands = [
    new ConfigGetCommand(),
    new ConfigSetCommand(),
    new ConfigDeleteCommand(),
  ]

  async action() { }
}
