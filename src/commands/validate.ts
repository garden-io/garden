import { Command } from "./base"
import { GardenContext } from "../context"

export class ValidateCommand extends Command {
  name = "validate"
  help = "Check your garden configuration for errors"

  async action(ctx: GardenContext) {
    await ctx.getModules()
  }
}
