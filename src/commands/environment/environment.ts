import { Command } from "../base"
import { EnvironmentStatusCommand } from "./status"
import { EnvironmentConfigureCommand } from "./configure"

export class EnvironmentCommand extends Command {
  name = "environment"
  alias = "env"
  help = "Outputs the status of your environment"

  subCommands = [
    new EnvironmentStatusCommand(),
    new EnvironmentConfigureCommand(),
  ]

  async action() { }
}
