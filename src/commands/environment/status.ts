import { Command, EnvironmentOption, ParameterValues } from "../base"
import { GardenContext } from "../../context"

const options = {
  env: new EnvironmentOption({
    help: "The environment (and optionally namespace) to check",
  }),
}

type Opts = ParameterValues<typeof options>

export class EnvironmentStatusCommand extends Command<typeof options> {
  name = "environment status"
  alias = "env status"
  help = "Outputs the status of your environment"

  options = options

  async action(ctx: GardenContext, _args, opts: Opts) {
    opts.env && ctx.setEnvironment(opts.env)
    const result = await ctx.getEnvironmentStatus()
    console.log(JSON.stringify(result, null, 4))
    return result
  }
}
